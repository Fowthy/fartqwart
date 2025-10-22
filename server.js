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
      const floatValue = parseFloat(value);

      // Store individual value (overwrite if no labels, or keep last)
      if (!metrics[name]) {
        metrics[name] = floatValue;
      }

      // If labeled, sum all values with same metric name
      if (labels) {
        const totalKey = `${name}_total`;
        metrics[totalKey] = (metrics[totalKey] || 0) + floatValue;

        // Parse labels into key-value pairs
        const labelPairs = {};
        const labelMatches = labels.matchAll(/(\w+)="([^"]+)"/g);
        for (const labelMatch of labelMatches) {
          labelPairs[labelMatch[1]] = labelMatch[2];
        }

        // Store specific labeled values (e.g., area="heap")
        if (Object.keys(labelPairs).length > 0) {
          const labelSuffix = Object.entries(labelPairs)
            .map(([k, v]) => `_${v}`)
            .join('');
          metrics[`${name}${labelSuffix}`] = floatValue;

          // Also store by label key for easier access (e.g., jvm_memory_bytes_used_heap)
          Object.entries(labelPairs).forEach(([key, val]) => {
            const shortKey = `${name}_${val}`;
            metrics[shortKey] = floatValue;
          });
        }
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

    // Calculate memory values
    const memoryUsedBytes = metrics.jvm_memory_bytes_used_heap || 0;
    const memoryMaxBytes = metrics.jvm_memory_bytes_max_heap || 0;
    const memoryUsedGB = (memoryUsedBytes / 1024 / 1024 / 1024).toFixed(2);
    const memoryMaxGB = (memoryMaxBytes / 1024 / 1024 / 1024).toFixed(2);
    const memoryFreeGB = memoryMaxBytes > 0 ? ((memoryMaxBytes - memoryUsedBytes) / 1024 / 1024 / 1024).toFixed(2) : 0;

    // Calculate uptime from process start time
    const uptimeSeconds = metrics.process_start_time_seconds
      ? Math.floor(Date.now() / 1000 - metrics.process_start_time_seconds)
      : 0;

    // Calculate GC stats
    const gcYoungCount = metrics['jvm_gc_collection_seconds_count_G1 Young Generation'] || 0;
    const gcYoungTime = metrics['jvm_gc_collection_seconds_sum_G1 Young Generation'] || 0;
    const gcConcurrentCount = metrics['jvm_gc_collection_seconds_count_G1 Concurrent GC'] || 0;
    const gcConcurrentTime = metrics['jvm_gc_collection_seconds_sum_G1 Concurrent GC'] || 0;
    const gcOldCount = metrics['jvm_gc_collection_seconds_count_G1 Old Generation'] || 0;
    const gcOldTime = metrics['jvm_gc_collection_seconds_sum_G1 Old Generation'] || 0;

    // Calculate file descriptor usage
    const openFds = metrics.process_open_fds || 0;
    const maxFds = metrics.process_max_fds || 1;
    const fdsPercent = ((openFds / maxFds) * 100).toFixed(2);

    // Get per-dimension stats
    const dimensions = {
      overworld: {
        players: metrics.minecraft_players_online_overworld || 0,
        chunks: metrics.minecraft_loaded_chunks_overworld || 0,
        totalChunks: metrics.minecraft_total_loaded_chunks_overworld || 0
      },
      nether: {
        players: metrics.minecraft_players_online_the_nether || 0,
        chunks: metrics.minecraft_loaded_chunks_the_nether || 0,
        totalChunks: metrics.minecraft_total_loaded_chunks_the_nether || 0
      },
      end: {
        players: metrics.minecraft_players_online_the_end || 0,
        chunks: metrics.minecraft_loaded_chunks_the_end || 0,
        totalChunks: metrics.minecraft_total_loaded_chunks_the_end || 0
      }
    };

    return {
      online: true,
      tps: metrics.minecraft_tps || 20,
      players: {
        online: metrics.minecraft_players_online_total || 0,
        max: metrics.minecraft_players_max || 20
      },
      memory: {
        used: memoryUsedGB,
        max: memoryMaxGB,
        free: memoryFreeGB
      },
      world: {
        entities: metrics.minecraft_entities_total || 0,
        chunks: metrics.minecraft_loaded_chunks_total || 0,
        tickTime: metrics.minecraft_mspt_mean || 0
      },
      performance: {
        mspt: {
          min: metrics.minecraft_mspt_min || 0,
          mean: metrics.minecraft_mspt_mean || 0,
          max: metrics.minecraft_mspt_max || 0
        }
      },
      jvm: {
        threads: {
          current: metrics.jvm_threads_current || 0,
          peak: metrics.jvm_threads_peak || 0,
          deadlocked: metrics.jvm_threads_deadlocked || 0,
          states: {
            runnable: metrics.jvm_threads_state_RUNNABLE || 0,
            waiting: metrics.jvm_threads_state_WAITING || 0,
            timedWaiting: metrics.jvm_threads_state_TIMED_WAITING || 0,
            blocked: metrics.jvm_threads_state_BLOCKED || 0
          }
        },
        gc: {
          youngGen: {
            collections: gcYoungCount,
            timeSeconds: gcYoungTime.toFixed(2)
          },
          concurrent: {
            collections: gcConcurrentCount,
            timeSeconds: gcConcurrentTime.toFixed(2)
          },
          oldGen: {
            collections: gcOldCount,
            timeSeconds: gcOldTime.toFixed(2)
          },
          totalCollections: gcYoungCount + gcConcurrentCount + gcOldCount,
          totalTimeSeconds: (gcYoungTime + gcConcurrentTime + gcOldTime).toFixed(2)
        },
        classesLoaded: metrics.jvm_classes_currently_loaded || 0
      },
      system: {
        fileDescriptors: {
          open: openFds,
          max: maxFds,
          percentUsed: fdsPercent
        }
      },
      dimensions: dimensions,
      connections: {
        statusPings: metrics.minecraft_handshakes_total_status || 0,
        logins: metrics.minecraft_handshakes_total_login || 0
      },
      uptime: uptimeSeconds,
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
