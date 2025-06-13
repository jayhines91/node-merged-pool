const util = require('./util');

/**
 * Build an AuxPoW proof for submitauxblock.
 * Options:
 *   - parentBlockHeader: hex string of 80 byte BTC header
 *   - coinbaseTx: hex string of the coinbase transaction
 *   - merkleBranch: array of hex strings from mining.notify
 *   - auxBlockHash: hash returned by getauxblock
 *   - chainId: aux chain id (defaults to 1)
 */
exports.build = function(opts){
    opts = opts || {};
    const header = Buffer.from(opts.parentBlockHeader, 'hex');
    const coinbase = Buffer.from(opts.coinbaseTx, 'hex');
    const branch = (opts.merkleBranch || []).map(function(h){
        return Buffer.from(h, 'hex');
    });
    const coinbaseProof = Buffer.concat([
        util.varIntBuffer(branch.length),
        Buffer.concat(branch),
        util.packInt32LE(0)
    ]);
    const branchProof = Buffer.concat([
        util.varIntBuffer(0),
        util.packInt32LE(0)
    ]);
    const blockHash = util.reverseBuffer(util.sha256d(header));
    const auxpow = Buffer.concat([
        coinbase,
        blockHash,
        coinbaseProof,
        branchProof,
        header
    ]);
    return auxpow.toString('hex');
};
