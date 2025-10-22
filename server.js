const express = require('express');
const axios = require('axios');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
const PORT = 3333;

// Configuration
const MINECRAFT_SERVER = '178.75.238.194';
const FABRIC_EXPORT_PORT = 25585; // Fabric Export port
const MINECRAFT_PORT = 25565;

app.use(express.static('public'));
app.use(express.json());

// Parse Prometheus metrics format
function parsePrometheusMetrics(data) {
  const metrics = {};
  const lines = data.split('\n');

  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue;

    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)\{?([^}]*)\}?\s+([^\s]+)/);
    if (match) {
      const [, name, labels, value] = match;
      metrics[name] = parseFloat(value);

      // Store with labels if present
      if (labels) {
        metrics[`${name}_labeled`] = { value: parseFloat(value), labels };
      }
    }
  }

  return metrics;
}

// Get Minecraft metrics from Fabric Export
async function getMinecraftMetrics() {
  try {
    const response = await axios.get(`http://${MINECRAFT_SERVER}:${FABRIC_EXPORT_PORT}/metrics`, {
      timeout: 5000
    });

    const metrics = parsePrometheusMetrics(response.data);

    return {
      online: true,
      tps: metrics.minecraft_tps || metrics.minecraft_tick_time || 20,
      players: {
        online: metrics.minecraft_players_online || 0,
        max: metrics.minecraft_players_max || 20
      },
      memory: {
        used: metrics.minecraft_memory_used_bytes ? (metrics.minecraft_memory_used_bytes / 1024 / 1024 / 1024).toFixed(2) : 0,
        max: metrics.minecraft_memory_max_bytes ? (metrics.minecraft_memory_max_bytes / 1024 / 1024 / 1024).toFixed(2) : 0,
        free: metrics.minecraft_memory_free_bytes ? (metrics.minecraft_memory_free_bytes / 1024 / 1024 / 1024).toFixed(2) : 0
      },
      world: {
        entities: metrics.minecraft_entities_total || 0,
        chunks: metrics.minecraft_chunks_loaded || 0,
        tickTime: metrics.minecraft_tick_time_average || 0
      },
      uptime: metrics.minecraft_uptime_seconds || 0,
      rawMetrics: metrics
    };
  } catch (error) {
    console.error('Error fetching Minecraft metrics:', error.message);
    return {
      online: false,
      error: error.message
    };
  }
}

// Get system metrics
async function getSystemMetrics() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  // Calculate CPU usage
  let cpuUsage = 0;
  try {
    if (os.platform() === 'linux') {
      const { stdout } = await execPromise("top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'");
      cpuUsage = parseFloat(stdout.trim()) || 0;
    } else {
      // Fallback for non-Linux systems
      cpuUsage = Math.random() * 100; // Placeholder
    }
  } catch (error) {
    console.error('Error getting CPU usage:', error.message);
  }

  // Get disk usage
  let diskUsage = { total: 0, used: 0, free: 0, percent: 0 };
  try {
    if (os.platform() === 'linux') {
      const { stdout } = await execPromise("df -h / | tail -1 | awk '{print $2,$3,$4,$5}'");
      const parts = stdout.trim().split(' ');
      diskUsage = {
        total: parts[0] || '0G',
        used: parts[1] || '0G',
        free: parts[2] || '0G',
        percent: parseFloat(parts[3]) || 0
      };
    }
  } catch (error) {
    console.error('Error getting disk usage:', error.message);
  }

  return {
    cpu: {
      cores: cpus.length,
      model: cpus[0].model,
      usage: cpuUsage.toFixed(2)
    },
    memory: {
      total: (totalMem / 1024 / 1024 / 1024).toFixed(2),
      used: (usedMem / 1024 / 1024 / 1024).toFixed(2),
      free: (freeMem / 1024 / 1024 / 1024).toFixed(2),
      percent: ((usedMem / totalMem) * 100).toFixed(2)
    },
    disk: diskUsage,
    uptime: os.uptime(),
    platform: os.platform(),
    hostname: os.hostname()
  };
}

// Query Minecraft server status (basic ping)
async function getServerStatus() {
  try {
    // Simple TCP connection test
    const net = require('net');
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(3000);

      socket.on('connect', () => {
        socket.destroy();
        resolve({ reachable: true });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({ reachable: false });
      });

      socket.on('error', () => {
        resolve({ reachable: false });
      });

      socket.connect(MINECRAFT_PORT, MINECRAFT_SERVER);
    });
  } catch (error) {
    return { reachable: false };
  }
}

// API endpoint to get all stats
app.get('/api/stats', async (req, res) => {
  try {
    const [minecraftMetrics, systemMetrics, serverStatus] = await Promise.all([
      getMinecraftMetrics(),
      getSystemMetrics(),
      getServerStatus()
    ]);

    res.json({
      timestamp: Date.now(),
      minecraft: minecraftMetrics,
      system: systemMetrics,
      serverStatus: serverStatus
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.listen(PORT, () => {
  console.log(`✅ Minecraft Monitor running at http://localhost:${PORT}`);
  console.log(`📊 Monitoring server: ${MINECRAFT_SERVER}:${MINECRAFT_PORT}`);
  console.log(`📈 Fabric Export endpoint: http://${MINECRAFT_SERVER}:${FABRIC_EXPORT_PORT}/metrics`);
});
