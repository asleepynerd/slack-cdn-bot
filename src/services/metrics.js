const promClient = require('prom-client');

const register = new promClient.Registry();

// disable metrics when bun is used because fucking bun hates the loop thing
if (!process.versions.bun) {
    promClient.collectDefaultMetrics({ register });
}

const uploadLatency = new promClient.Histogram({
  name: 'cdn_upload_duration_seconds',
  help: 'Time taken to upload files to R2',
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register]
});

const uploadCounter = new promClient.Counter({
  name: 'cdn_uploads_total',
  help: 'Total number of file uploads',
  labelNames: ['status'],
  registers: [register]
});

const storageBytes = new promClient.Gauge({
  name: 'cdn_storage_bytes',
  help: 'Total storage used in bytes',
  registers: [register]
});

const healthCheckStatus = new promClient.Gauge({
  name: 'cdn_health_check_status',
  help: 'Status of the last health check (1 = success, 0 = failure)',
  registers: [register]
});

const healthCheckLatency = new promClient.Gauge({
  name: 'cdn_health_check_latency_seconds',
  help: 'Latency of the last health check in seconds',
  registers: [register]
});

module.exports = {
  register,
  uploadLatency,
  uploadCounter,
  storageBytes,
  healthCheckStatus,
  healthCheckLatency
}; 