const net = require('net');
const events = require('events');
const Stratum = require('./stratum.js');
const daemon = require('./daemon.js');
const util = require('./util.js');
const AuxPoW = require('./auxpow-builder.js');

function MergedMiningProxy(options, authorizeFn){
    events.EventEmitter.call(this);
    const _this = this;
    this.options = options || {};
    authorizeFn = authorizeFn || function(ip, port, worker, password, cb){
        cb({error: null, authorized: true, disconnect: false});
    };

    let upstreamSocket;
    let upstreamBuffer = '';
    let extranonce1 = null;
    let extranonce2Size = 4;
    let requestId = 3;
    let pendingSubmit = {};
    let currentAuxBlock = null;
    const jobMap = {};

    const elaDaemon = options.elastosDaemon ? new daemon.interface([options.elastosDaemon]) : null;

    const stratumServer = new Stratum.Server(options, authorizeFn);

    stratumServer.on('client.connected', function(client){
        client.on('subscription', function(params, cb){
            cb(null, extranonce1, extranonce2Size);
            if(options.diff) client.sendDifficulty(options.diff);
        }).on('submit', function(params, cb){
            const id = ++requestId;
            pendingSubmit[id] = { cb: cb, params: params };
            const submitParams = [client.workerName, params.jobId, params.extraNonce2, params.nTime, params.nonce];
            sendUpstream({id: id, method:'mining.submit', params: submitParams});
        });
    });

    function connectUpstream(){
        upstreamSocket = net.connect(options.upstream.port, options.upstream.host, function(){
            sendUpstream({id:1, method:'mining.subscribe', params:[]});
            sendUpstream({id:2, method:'mining.authorize', params:[options.upstream.user, options.upstream.password]});
        });
        upstreamSocket.setEncoding('utf8');
        upstreamSocket.on('data', handleUpstreamData);
        upstreamSocket.on('error', function(err){ _this.emit('error', err); });
    }

    function handleUpstreamData(data){
        upstreamBuffer += data;
        let lines = upstreamBuffer.split('\n');
        upstreamBuffer = lines.pop();
        lines.forEach(function(line){
            if(!line.trim()) return;
            let msg;
            try{ msg = JSON.parse(line); } catch(e){ return; }
            processMessage(msg);
        });
    }

    function processMessage(msg){
        if(msg.id && pendingSubmit[msg.id]){
            const p = pendingSubmit[msg.id];
            p.cb(msg.error, msg.result);
            if(!msg.error && msg.result){
                const job = jobMap[p.params.jobId];
                if(job) submitAuxPow(job, p.params);
            }
            delete pendingSubmit[msg.id];
            return;
        }
        if(msg.id === 1 && msg.result){
            extranonce1 = msg.result[1];
            extranonce2Size = msg.result[2];
            _this.emit('ready');
            return;
        }
        if(msg.method === 'mining.notify'){
            fetchAuxBlock(function(aux){
                const params = msg.params.slice();
                if(aux && aux.hash){
                    const tag = 'fabe6d6d' + util.reverseHex(aux.hash) + '01000000' + '00000000';
                    params[2] = params[2] + tag;
                    jobMap[params[0]] = {
                        jobId: params[0],
                        prevHash: params[1],
                        coinb1: params[2],
                        coinb2: params[3],
                        merkle_branch: params[4],
                        version: params[5],
                        nbits: params[6],
                        auxBlock: aux
                    };
                }
                stratumServer.broadcastMiningJobs(params);
            });
            return;
        }
        if(msg.method === 'mining.set_difficulty'){
            const diff = msg.params[0];
            const clients = stratumServer.getStratumClients();
            Object.keys(clients).forEach(function(id){
                clients[id].sendDifficulty(diff);
            });
            return;
        }
    }

    function sendUpstream(obj){
        upstreamSocket.write(JSON.stringify(obj)+'\n');
    }

    function fetchAuxBlock(cb){
        if(!elaDaemon){ cb(); return; }
        elaDaemon.cmd('getauxblock', [], function(result){
            const res = Array.isArray(result) ? result[0] : result;
            if(res && res.response){
                currentAuxBlock = res.response;
            }
            cb(currentAuxBlock);
        });
    }

    function serializeHeader(version, prevhash, merkleRoot, nTime, nBits, nonce){
        const header = Buffer.alloc(80);
        let pos = 0;
        header.write(nonce, pos, 4, 'hex');
        header.write(nBits, pos += 4, 4, 'hex');
        header.write(nTime, pos += 4, 4, 'hex');
        header.write(merkleRoot, pos += 4, 32, 'hex');
        header.write(prevhash, pos += 32, 32, 'hex');
        header.writeUInt32BE(parseInt(version, 16), pos + 32);
        return util.reverseBuffer(header);
    }

    function submitAuxPow(job, submit){
        if(!elaDaemon || !job || !currentAuxBlock) return;
        const coinbaseHex = job.coinb1 + extranonce1 + submit.extraNonce2 + job.coinb2;
        const coinbaseHash = util.sha256d(Buffer.from(coinbaseHex, 'hex'));
        let root = coinbaseHash;
        job.merkle_branch.forEach(function(step){
            root = util.sha256d(Buffer.concat([root, Buffer.from(step, 'hex')]));
        });
        const merkleRootHex = util.reverseBuffer(root).toString('hex');
        const header = serializeHeader(job.version, job.prevHash, merkleRootHex, submit.nTime, job.nbits, submit.nonce);
        const auxpowHex = AuxPoW.build({
            parentBlockHeader: header.toString('hex'),
            coinbaseTx: coinbaseHex,
            merkleBranch: job.merkle_branch,
            auxBlockHash: job.auxBlock.hash,
            chainId: 1
        });
        elaDaemon.cmd('submitauxblock', [job.auxBlock.hash, auxpowHex], function(){}, true);
    }

    this.start = function(){
        connectUpstream();
    };

    this.getStratumServer = function(){ return stratumServer; };
}
MergedMiningProxy.prototype.__proto__ = events.EventEmitter.prototype;

module.exports.createProxy = function(options, authorizeFn){
    return new MergedMiningProxy(options, authorizeFn);
};
