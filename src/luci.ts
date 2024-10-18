import axios from "axios";
import type { AxiosInstance } from "axios";
import * as https from "node:https";

export class LUCI {
  host: string;
  username: string;
  password: string;
  client: AxiosInstance;
  token: string = "";

  constructor(host: string, username: string, password: string) {
    this.host = host;
    this.username = username;
    this.password = password;
    this.client = axios.create({
      baseURL: `${this.host}/cgi-bin/luci/rpc`,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
    });
  }

  async init() {
    const authParams = JSON.stringify({
      id: 1,
      method: "login",
      params: [this.username, this.password],
    });

    try {
      const tokenRes = await this.client.post("/auth", `${authParams}`);
      this.token = tokenRes.data.result;
    } catch (error) {
      console.log(`authentication failed: ${error}`);
    }
  }

  async getWlanDevices(): Promise<string[]> {
    const params = JSON.stringify({
      id: 1,
      method: "net.devices",
    });

    try {
      const result = await this.client.post(`/sys?auth=${this.token}`, params);
      const entries = result.data.result;
      return entries.filter((device: string) => device.startsWith("wlan"));
    } catch (error) {
      console.log(error);
      return [];
    }
  }

  async getWifiClients(iface: string): Promise<string[]> {
    const params = JSON.stringify({
      id: 1,
      method: "wifi.getiwinfo",
      params: [iface],
    });

    try {
      const result = await this.client.post(`/sys?auth=${this.token}`, params);

      const entries = Object.keys(result.data.result.assoclist || {});
      return entries;
    } catch (error) {
      console.log(error);
      return [];
    }
  }

  autoUpdateToken(interval: number): Timer {
    return setInterval(async () => {
      try {
        await this.init();
        console.log("updated robovac token");
      } catch (error) {
        console.log(`token update failed: ${error}`);
      }
    }, interval);
  }
}
