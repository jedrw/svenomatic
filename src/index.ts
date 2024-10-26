import * as pino from "pino";
import * as timers from "node:timers/promises";
import { LUCI } from "./luci.ts";
import * as eufyrobovac from "eufy-robovac";

const LOG_LEVEL =
  process.env.LOG_LEVEL === "debug"
    ? pino.levels.values.debug
    : pino.levels.values.info;
const POLL_INTERVAL = process.env.POLL_INTERVAL
  ? Number(process.env.POLL_INTERVAL)
  : 1000 * 60;
const TRIGGER_DELAY = process.env.TRIGGER_DELAY
  ? Number(process.env.TRIGGER_DELAY)
  : 1000 * 60 * 5;
const MONITORED_MACADDRESSES = process.env.MONITORED_MACADDRESSES
  ? process.env.MONITORED_MACADDRESSES.toUpperCase().split(",")
  : [];
if (MONITORED_MACADDRESSES.length === 0) {
  throw new Error("No monitored mac addresses set");
}

const OPENWRT_HOST = process.env.OPENWRT_HOST;
const OPENWRT_USERNAME = process.env.OPENWRT_USERNAME;
const OPENWRT_PASSWORD = process.env.OPENWRT_PASSWORD;

const ROBOVAC_DEVICE_ID = process.env.ROBOVAC_DEVICE_ID;
const ROBOVAC_LOCAL_KEY = process.env.ROBOVAC_LOCAL_KEY;
const ROBOVAC_IP = process.env.ROBOVAC_IP;
const ROBOVAC_DEBUG = !!process.env.ROBOVAC_DEBUG;

const logger = pino.pino({
  base: null,
  timestamp: pino.stdTimeFunctions.isoTime,
  level: pino.levels.labels[LOG_LEVEL],
});

async function main() {
  if (POLL_INTERVAL > TRIGGER_DELAY) {
    throw new Error("poll interval cannot be higher than trigger delay");
  }
  if (!OPENWRT_HOST) {
    throw new Error("OPENWRT_HOST must be set");
  }
  if (!OPENWRT_USERNAME) {
    throw new Error("OPENWRT_USERNAME must be set");
  }
  if (!OPENWRT_PASSWORD) {
    throw new Error("OPENWRT_PASSWORD must be set");
  }
  if (!ROBOVAC_DEVICE_ID) {
    throw new Error("ROBOVAC_DEVICE_ID must be set");
  }
  if (!ROBOVAC_LOCAL_KEY) {
    throw new Error("ROBOVAC_LOCAL_KEY must be set");
  }
  if (!ROBOVAC_IP) {
    throw new Error("ROBOVAC_IP must be set");
  }

  logger.debug({ monitoredMacaddressed: MONITORED_MACADDRESSES });

  const luci = new LUCI(
    `https://${OPENWRT_HOST}`,
    OPENWRT_USERNAME,
    OPENWRT_PASSWORD
  );

  await luci.init();

  const tokenUpdateInterval = 1000 * 60 * 30;
  const tokenUpdater = luci.autoUpdateToken(tokenUpdateInterval);

  const robovacConfig = {
    deviceId: ROBOVAC_DEVICE_ID,
    localKey: ROBOVAC_LOCAL_KEY,
    ip: ROBOVAC_IP,
  };

  const robovac = new eufyrobovac.RoboVac(robovacConfig, ROBOVAC_DEBUG);
  let poll = true;

  const cleanup = async () => {
    poll = false;
    clearInterval(tokenUpdater);
    await robovac.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  let svenomaticTriggeredRobovac = false;
  let noOneHomeFor = 0;

  while (poll) {
    const wlanInterfaces = await luci.getWlanDevices();
    logger.debug({ wlanInterfaces: wlanInterfaces });
    const connectedMacAddresses = (
      await Promise.all(
        wlanInterfaces.map(async (iface: string) => {
          return await luci.getWifiClients(iface);
        })
      )
    ).flat();
    logger.debug({ connectedMacAddresses: connectedMacAddresses });

    await robovac.getStatuses();
    let robovacBatteryLevel =
      robovac.statuses.dps[
        robovac.BATTERY_LEVEL as keyof typeof robovac.statuses.dps
      ];
    logger.info({
      robovacStatus: (
        robovac.statuses.dps[
          robovac.WORK_STATUS as keyof typeof robovac.statuses.dps
        ] as string
      ).toLowerCase(),
      robovacBatteryLevel: robovacBatteryLevel,
    });

    const isFullyCharged = robovacBatteryLevel === 100;
    const isNoOneHome = !MONITORED_MACADDRESSES.some((item) =>
      connectedMacAddresses.includes(item)
    );
    const isRobovacRunning =
      robovac.statuses.dps[
        robovac.WORK_STATUS as keyof typeof robovac.statuses.dps
      ] === eufyrobovac.WorkStatus.RUNNING;

    if (isFullyCharged && isNoOneHome && !isRobovacRunning) {
      if (noOneHomeFor < TRIGGER_DELAY) {
        logger.info(
          `no one home, triggering robovac in ${
            (TRIGGER_DELAY - noOneHomeFor) / 1000
          }s`
        );
        noOneHomeFor += POLL_INTERVAL;
      } else {
        svenomaticTriggeredRobovac = true;
        noOneHomeFor = 0;
        await robovac.startCleaning();
        logger.info("triggered robovac");
      }
    } else if (isRobovacRunning && !isNoOneHome && svenomaticTriggeredRobovac) {
      svenomaticTriggeredRobovac = false;
      await robovac.goHome();
      logger.info("someone came home, sent robovac home");
      noOneHomeFor = 0;
    } else if (!isRobovacRunning) {
      svenomaticTriggeredRobovac = false;
    } else if (noOneHomeFor !== 0) {
      logger.info("someone came home, resetting trigger delay");
      noOneHomeFor = 0;
    }

    await timers.setTimeout(POLL_INTERVAL);
  }
}

if (import.meta.main) {
  main();
}
