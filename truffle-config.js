module.exports = {
  networks: {
    test: {
      host: "0.0.0.0",
      port: 7545,
      network_id: "*",
      gasPrice: 1
    }
  },
  mocha: {
  },
  compilers: {
    solc: {
      version: "0.7.6"
    }
  },
  db: {
    enabled: false
  }
};
