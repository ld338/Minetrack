<p align="center">
	<img width="120" height="120" src="assets/images/logo.svg">
</p>

# Minetrack Fork with Random Proxy Support

This is a fork of the original [Minetrack](https://minetrack.me) project. In this version, server pings are conducted using random proxies, enhancing privacy and helping to bypass rate limits.

### Features

- 🌐 **Random Proxy Support**: Automatically pings Minecraft servers using a pool of random proxies.
- 🚀 Real-time player count tracking with customizable update speed.
- 📝 Historical player count logging with 24-hour peak and record tracking.
- 📈 Historical graph with customizable time frame.
- 📦 Dashboard with customizable sorting and viewing options.
- 📱(Decent) mobile support.
- 🕹 Supports both Minecraft Java Edition and Minecraft Bedrock Edition.

### Installation

1. Ensure you have Node 12.4.0+ installed (`node -v` to check your version).
2. Configure your proxy pool in `proxylist.json`.
3. Adjust `config.json` as needed.
4. Add or remove servers in `servers.json`.
5. Run `npm install` to install dependencies.
6. Run `npm run build` to bundle assets.
7. Start the application with `node main.js` (may need sudo).

### Docker

To build and deploy this fork with Docker:

```
# Build the image with the tag 'minetrack-proxy:latest'
docker build . --tag minetrack-proxy:latest

# Start the container, delete on exit
# Publish container port 8080 on host port 80
docker run --rm --publish 80:8080 minetrack-proxy:latest
```

Or use `docker-compose`:

```
# Build and start the service
docker-compose up --build

# Stop service and remove artifacts
docker-compose down
```

### Notes

- This fork is based on the original Minetrack project, with the primary addition being random proxy support.
- For further details, refer to the original [Minetrack repository](https://github.com/Cryptkeeper/Minetrack).
