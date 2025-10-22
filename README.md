# Minecraft Server Monitor Dashboard

Real-time monitoring dashboard for your Minecraft Fabric server with auto-refresh statistics.

## Features

- **Real-time Minecraft Stats:**
  - TPS (Ticks Per Second)
  - Player count and online players
  - JVM memory usage
  - Loaded chunks and entities
  - Server uptime
  - All Fabric Export metrics

- **System Monitoring:**
  - CPU usage and info
  - RAM usage
  - Disk usage
  - System uptime

- **Auto-refresh:** Updates every 5 seconds
- **Beautiful UI:** Modern, responsive design
- **One-page dashboard:** All stats in one place

## Server Configuration (Minecraft Server)

### Step 1: Configure Fabric Export Mod

Your Fabric Export mod needs to be configured to expose metrics. Here's what you need to do on your Minecraft server:

1. **Locate the mod configuration file:**
   - Check your server's `config` folder
   - Look for a file like `fabric-export.properties` or `fabricexport.toml`

2. **Enable metrics endpoint:**
   Add/modify these settings:
   ```properties
   # Enable metrics export
   enabled=true

   # Port to expose metrics (default 9225)
   port=9225

   # Bind address (0.0.0.0 for all interfaces)
   host=0.0.0.0

   # Enable detailed metrics
   detailed=true
   ```

3. **Open firewall port:**
   On your server (178.75.238.194), open port 9225:
   ```bash
   # For UFW (Ubuntu/Debian)
   sudo ufw allow 9225

   # For firewalld (CentOS/RHEL)
   sudo firewall-cmd --permanent --add-port=9225/tcp
   sudo firewall-cmd --reload

   # For iptables
   sudo iptables -A INPUT -p tcp --dport 9225 -j ACCEPT
   ```

4. **Restart your Minecraft server**

5. **Verify metrics endpoint:**
   ```bash
   curl http://178.75.238.194:9225/metrics
   ```
   You should see Prometheus-format metrics output.

### Step 2: Alternative - If Fabric Export doesn't work

If the Fabric Export mod doesn't have a configuration file or doesn't work, you may need to:

1. **Check mod documentation:**
   - Look in the mod's JAR file or its GitHub/CurseForge page
   - Some mods auto-enable metrics without config

2. **Try alternative mods:**
   - **Prometheus Exporter for Fabric** (if compatible with 1.21.8)
   - **Fabric Stats** (check compatibility)

3. **Create custom mod:**
   If no existing mod works, I can help you create a simple Fabric mod that exposes an HTTP endpoint with the metrics you need.

## Webapp Setup (Your Local Machine or Monitoring Server)

### Prerequisites

- Node.js 14+ installed
- npm or yarn

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure server address (if needed):**
   Edit `server.js` lines 9-11:
   ```javascript
   const MINECRAFT_SERVER = '178.75.238.194';
   const FABRIC_EXPORT_PORT = 9225;
   const MINECRAFT_PORT = 25565;
   ```

3. **Start the monitoring webapp:**
   ```bash
   npm start
   ```

4. **Open your browser:**
   Navigate to: `http://localhost:3000`

### Running in Production

To keep the webapp running 24/7, use PM2:

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start server.js --name minecraft-monitor

# Save PM2 configuration
pm2 save

# Setup auto-restart on server reboot
pm2 startup
```

## Troubleshooting

### Metrics Not Loading

**Error: "Error fetching Minecraft metrics"**

1. **Check if Fabric Export is running:**
   ```bash
   curl http://178.75.238.194:9225/metrics
   ```

2. **Verify firewall is open:**
   ```bash
   telnet 178.75.238.194 9225
   ```

3. **Check Minecraft server logs:**
   Look for Fabric Export initialization messages

4. **Verify mod is installed:**
   Check your server's `mods` folder for the Fabric Export JAR

### Port Already in Use

If port 3000 is already in use, change it in `server.js`:
```javascript
const PORT = 3001; // Change to any available port
```

### System Stats Not Working

The backend tries to get system stats from the machine running the webapp, not the Minecraft server. To monitor the Minecraft server's system stats, you need to run this webapp ON the Minecraft server itself, or create a separate agent.

## Customization

### Change Refresh Interval

Edit `public/index.html` line 480:
```javascript
refreshInterval = setInterval(fetchStats, 5000); // 5000ms = 5 seconds
```

### Add More Metrics

1. Check available metrics:
   ```bash
   curl http://178.75.238.194:9225/metrics
   ```

2. Add parsing in `server.js` in the `getMinecraftMetrics()` function

3. Display in `public/index.html` by adding new stat rows

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────┐
│   Your Browser  │ ◄────── │  Node.js Backend │ ◄────── │  Minecraft  │
│   (Dashboard)   │  HTTP   │  (Express API)   │  HTTP   │   Server    │
└─────────────────┘         └──────────────────┘         └─────────────┘
                                     │                    (Fabric Export
                                     │                     Port 9225)
                                     ▼
                            ┌─────────────────┐
                            │  System Metrics │
                            │   (OS Stats)    │
                            └─────────────────┘
```

## What Statistics Are Displayed

### Minecraft Metrics (from Fabric Export):
- `minecraft_tps` - Server TPS
- `minecraft_tick_time_average` - Average tick time
- `minecraft_players_online` - Current players
- `minecraft_players_max` - Max players
- `minecraft_memory_used_bytes` - JVM memory used
- `minecraft_memory_max_bytes` - JVM memory max
- `minecraft_chunks_loaded` - Loaded chunks
- `minecraft_entities_total` - Total entities
- `minecraft_uptime_seconds` - Server uptime

### System Metrics (from Node.js):
- CPU model, cores, usage %
- RAM total, used, free
- Disk usage
- System uptime

## License

MIT

## Support

If you encounter issues:
1. Check that Fabric Export mod is properly installed and configured
2. Verify firewall settings
3. Check server logs
4. Test the metrics endpoint directly with curl
