module.exports = {
  apps: [
    {
      name: "mm-pos-cloud-api",
      cwd: process.env.MM_POS_SERVER_DIR || process.cwd(),
      script: "dist/server.js",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production"
      },
      error_file: "logs/mm-pos-api.err.log",
      out_file: "logs/mm-pos-api.out.log",
      merge_logs: true
    }
  ]
};
