const minecraftJavaPing = require("mcping-js");
const minecraftBedrockPing = require("mcpe-ping-fixed");
const logger = require("./logger");
const MessageOf = require("./message");
const { TimeTracker } = require("./time");
const { getPlayerCountOrNull } = require("./util");
const config = require("../config");

const axios = require("axios");
const proxyAgent = require("https-proxy-agent");

let cachedProxies = [];
let lastProxyFetchTime = 0;
const proxyCacheDuration = 10 * 60 * 1000;

async function fetchProxies() {
  const currentTime = Date.now();

  if (
    cachedProxies.length > 0 &&
    currentTime - lastProxyFetchTime < proxyCacheDuration
  ) {
    return cachedProxies;
  }

  try {
    const response = await axios.get(
      "https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc"
    );
    cachedProxies = response.data.data.map(
      (proxy) =>
        `${proxy.protocols[0].toLowerCase()}://${proxy.ip}:${proxy.port}`
    );
    lastProxyFetchTime = currentTime;
    return cachedProxies;
  } catch (error) {
    logger.log("error", "Failed to fetch proxies: %s", error.message);
    return cachedProxies.length > 0 ? cachedProxies : [];
  }
}

function getRandomProxy(proxies) {
  const randomIndex = Math.floor(Math.random() * proxies.length);
  return new proxyAgent(proxies[randomIndex]);
}

async function ping(serverRegistration, timeout, callback, version) {
  const proxies = await fetchProxies();

  if (proxies.length === 0) {
    callback(new Error("No proxies available"));
    return;
  }

  switch (serverRegistration.data.type) {
    case "PC":
      serverRegistration.dnsResolver.resolve((host, port, remainingTimeout) => {
        const server = new minecraftJavaPing.MinecraftServer(
          host,
          port || 25565,
          getRandomProxy(proxies)
        );

        server.ping(remainingTimeout, version, (err, res) => {
          if (err) {
            callback(err);
          } else {
            const payload = {
              players: {
                online: capPlayerCount(
                  serverRegistration.data.ip,
                  parseInt(res.players.online)
                ),
              },
              version: parseInt(res.version.protocol),
            };

            if (res.favicon && res.favicon.startsWith("data:image/")) {
              payload.favicon = res.favicon;
            }

            callback(null, payload);
          }
        });
      });
      break;

    case "PE":
      const proxy = getRandomProxy(proxies);
      minecraftBedrockPing(
        serverRegistration.data.ip,
        serverRegistration.data.port || 19132,
        (err, res) => {
          if (err) {
            callback(err);
          } else {
            callback(null, {
              players: {
                online: capPlayerCount(
                  serverRegistration.data.ip,
                  parseInt(res.currentPlayers)
                ),
              },
            });
          }
        },
        timeout,
        { agent: proxy }
      );
      break;

    default:
      throw new Error("Unsupported type: " + serverRegistration.data.type);
  }
}

function capPlayerCount(host, playerCount) {
  const maxPlayerCount = 250000;

  if (playerCount !== Math.min(playerCount, maxPlayerCount)) {
    logger.log(
      "warn",
      "%s returned a player count of %d, Minetrack has capped it to %d to prevent browser performance issues with graph rendering. If this is in error, please edit maxPlayerCount in ping.js!",
      host,
      playerCount,
      maxPlayerCount
    );

    return maxPlayerCount;
  } else if (playerCount !== Math.max(playerCount, 0)) {
    logger.log(
      "warn",
      "%s returned an invalid player count of %d, setting to 0.",
      host,
      playerCount
    );

    return 0;
  }
  return playerCount;
}

class PingController {
  constructor(app) {
    this._app = app;
    this._isRunningTasks = false;
  }

  schedule() {
    setInterval(this.pingAll, config.rates.pingAll);
    this.pingAll();
  }

  pingAll = () => {
    const { timestamp, updateHistoryGraph } =
      this._app.timeTracker.newPointTimestamp();

    this.startPingTasks((results) => {
      const updates = [];

      for (const serverRegistration of this._app.serverRegistrations) {
        const result = results[serverRegistration.serverId];

        if (config.logToDatabase) {
          const unsafePlayerCount = getPlayerCountOrNull(result.resp);
          this._app.database.insertPing(
            serverRegistration.data.ip,
            timestamp,
            unsafePlayerCount
          );
        }

        const update = serverRegistration.handlePing(
          timestamp,
          result.resp,
          result.err,
          result.version,
          updateHistoryGraph
        );
        updates[serverRegistration.serverId] = update;
      }

      this._app.server.broadcast(
        MessageOf("updateServers", {
          timestamp: TimeTracker.toSeconds(timestamp),
          updateHistoryGraph,
          updates,
        })
      );
    });
  };

  startPingTasks = (callback) => {
    if (this._isRunningTasks) {
      logger.log(
        "warn",
        'Started re-pinging servers before the last loop has finished! You may need to increase "rates.pingAll" in config.json'
      );
      return;
    }

    this._isRunningTasks = true;

    const results = [];

    for (const serverRegistration of this._app.serverRegistrations) {
      const version = serverRegistration.getNextProtocolVersion();

      ping(
        serverRegistration,
        config.rates.connectTimeout,
        (err, resp) => {
          if (err && config.logFailedPings !== false) {
            logger.log(
              "error",
              "Failed to ping %s: %s",
              serverRegistration.data.ip,
              err.message
            );
          }

          results[serverRegistration.serverId] = {
            resp,
            err,
            version,
          };

          if (
            Object.keys(results).length === this._app.serverRegistrations.length
          ) {
            this._isRunningTasks = false;
            callback(results);
          }
        },
        version.protocolId
      );
    }
  };
}

module.exports = PingController;
