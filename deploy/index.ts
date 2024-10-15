import * as pulumi from "@pulumi/pulumi";
import {
  Deployment,
  getEnv,
  hostnamePrefix,
  k8sProvider,
} from "@lupinelab/tk3s-deployment";

export = async () => {
  const appName = pulumi.getProject();
  const hostname = `${hostnamePrefix()}${appName}.lupinelab.co.uk`;
  const expose = getEnv(true) == "production" ? "external" : "internal";
  const releaseName = `${getEnv()}-${appName}`;
  new Deployment(
    "svenomatic",
    {
      hostname,
      expose,
      name: releaseName,
      chart: "../chart/svenomatic",
      namespace: releaseName,
      createNamespace: true,
      values: {
        image: {
          tag: process.env["RIDEWEATHER_VERSION"] || process.env["CIRCLE_SHA1"],
          username: process.env["REGISTRY_USERNAME"],
          password: process.env["REGISTRY_PASSWORD"],
        },
        config: {
          MONITORED_MACADDRESSES: "",
          OPENWRT_HOST: "",
          OPENWRT_USERNAME: "",
          ROBOVAC_IP: "",
        },
        secrets: {
          OPENWRT_PASSWORD: "",
          ROBOVAC_DEVICE_ID: "",
          ROBOVAC_LOCAL_KEY: "",
        },
      },
    },
    {
      provider: k8sProvider(),
    }
  );
};
