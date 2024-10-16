import * as pulumi from "@pulumi/pulumi";
import { Deployment, getEnv, k8sProvider } from "@lupinelab/tk3s-deployment";

export = async () => {
  const appName = pulumi.getProject();
  const releaseName = `${getEnv()}-${appName}`;
  new Deployment(
    appName,
    {
      name: releaseName,
      chart: `../chart/${appName}`,
      namespace: releaseName,
      createNamespace: true,
      values: {
        image: {
          tag: process.env["SVENOMATIC_VERSION"] || process.env["CIRCLE_SHA1"],
          username: process.env["REGISTRY_USERNAME"],
          password: process.env["REGISTRY_PASSWORD"],
        },
        config: {
          MONITORED_MACADDRESSES: "FE:93:D6:9E:52:AC,1E:16:3D:AE:F2:63",
          OPENWRT_HOST: "192.168.200.252",
          OPENWRT_USERNAME: appName,
          ROBOVAC_IP: "192.168.111.9",
        },
        secrets: {
          OPENWRT_PASSWORD: process.env["OPENWRT_PASSWORD"],
          ROBOVAC_DEVICE_ID: process.env["ROBOVAC_DEVICE_ID"],
          ROBOVAC_LOCAL_KEY: process.env["ROBOVAC_LOCAL_KEY"],
        },
      },
    },
    {
      provider: k8sProvider(),
    }
  );
};
