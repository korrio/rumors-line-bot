module.exports = {
  apps: [
    {
      name: 'heroku-line-bot',
      script: 'src/index.js',

      // From Heroku production
      // Can't use process.env directly, or it will mess up with pm2 internals
      updateEnv: true,

      // Set by Heroku or -1 to scale to max cpu core -1
      instances: process.env.WEB_CONCURRENCY || -1,
      autorestart: true,
      watch: false,
      max_memory_restart: `${process.env.WEB_MEMORY || 512}M`, // // Auto-restart if process takes more than XXmo
    },
  ],
};
