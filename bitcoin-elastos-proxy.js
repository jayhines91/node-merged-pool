var Stratum = require('./lib/index.js');

var options = {
    coin: { name: 'Bitcoin', symbol: 'BTC', algorithm: 'sha256' },
    ports: { '3333': { diff: 4 } },
    upstream: { host: '127.0.0.1', port: 3333, user: 'worker', password: 'x' },
    elastosDaemon: {
        host: '127.0.0.1',
        port: 21334,
        user: 'user',
        password: 'pass'
    }
};

var proxy = Stratum.proxy.createProxy(options, function(ip, port, worker, pass, cb){
    console.log('Authorize ' + worker + ' from ' + ip);
    cb({error: null, authorized: true, disconnect: false});
});

proxy.on('ready', function(){
    console.log('Upstream ready, proxy started');
});

proxy.start();
