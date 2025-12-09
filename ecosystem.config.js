module.exports = {
  apps: [
    {
      name: "sftp-download",   
      script: "merge.js",     
      watch: false,            
      exec_mode: "fork",       
      instances: 1,        
      env: {
        NODE_ENV: "production"
      }
    }
  ]
}
