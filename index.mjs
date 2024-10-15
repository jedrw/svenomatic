import * as pino from "pino";
import { exit } from "process";
import { LUCI } from "./luci.mjs";
import * as eufyrobovac from "eufy-robovac";

const REFRESH_INTERVAL = process.env["REFRESH_INTERVAL_MS"] ?? 10000;
const MONITORED_MACADDRESSES = process.env["MONITORED_MACADDRESSES"]
  ? process.env["MONITORED_MACADDRESSES"].split(",")
  : [];

const OPENWRT_HOST = process.env["OPENWRT_HOST"];
const OPENWRT_USERNAME = process.env["OPENWRT_USERNAME"] ?? "root";
const OPENWRT_PASSWORD = process.env["OPENWRT_PASSWORD"];

const ROBOVAC_DEVICE_ID = process.env["ROBOVAC_DEVICE_ID"];
const ROBOVAC_LOCAL_KEY = process.env["ROBOVAC_LOCAL_KEY"];
const ROBOVAC_IP = process.env["ROBOVAC_IP"];

const logger = pino.pino({
  base: null,
  timestamp: pino.stdTimeFunctions.isoTime,
});

async function main() {
  if (MONITORED_MACADDRESSES.length === 0) {
    throw new Error("No monitored mac addresses are set");
  }

  const luci = new LUCI(
    `https://${OPENWRT_HOST}`,
    OPENWRT_USERNAME,
    OPENWRT_PASSWORD
  );

  await luci.init();

  let updateInterval = 1000 * 60 * 30;
  const tokenUpdater = luci.autoUpdateToken(updateInterval);

  const robovacConfig = {
    deviceId: ROBOVAC_DEVICE_ID,
    localKey: ROBOVAC_LOCAL_KEY,
    ip: ROBOVAC_IP,
  };

  let robovac = new eufyrobovac.RoboVac(robovacConfig, false);
  let svenomaticTriggeredRobovac = false;
  let poll = true;

  const cleanup = async () => {
    poll = false;
    clearInterval(tokenUpdater[Symbol.toPrimitive]);
    await robovac.disconnect();
    exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  while (poll) {
    const wlanInterfaces = await luci.getWlanDevices();
    const connectedMacAddresses = (
      await Promise.all(
        wlanInterfaces.map(async (iface) => {
          const result = await luci.getWifiClients(iface);
          return Object.keys(result.assoclist || {});
        })
      )
    ).flat();

    await robovac.getStatuses();
    logger.info({
      robovacStatus: robovac.statuses.dps[robovac.WORK_STATUS].toLowerCase(),
    });

    if (
      robovac.statuses.dps[robovac.WORK_STATUS] ===
        eufyrobovac.WorkStatus.COMPLETED &&
      !MONITORED_MACADDRESSES.some((item) =>
        connectedMacAddresses.includes(item)
      )
    ) {
      svenomaticTriggeredRobovac = true;
      await robovac.startCleaning();
      logger.info("triggered robovac");
    } else if (
      robovac.statuses.dps[robovac.WORK_STATUS] ===
        eufyrobovac.WorkStatus.RUNNING &&
      svenomaticTriggeredRobovac &&
      MONITORED_MACADDRESSES.some((item) =>
        connectedMacAddresses.includes(item)
      )
    ) {
      svenomaticTriggeredRobovac = false;
      await robovac.goHome();
      logger.info("sent robovac home");
    }

    await new Promise((r) => setTimeout(r, REFRESH_INTERVAL));
  }
}

main().catch((err) => console.error(err));
