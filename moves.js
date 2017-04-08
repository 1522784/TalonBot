var fs = require('fs');

var getdata = exports.getdata = function (pokemon) {
    return JSON.parse(fs.readFileSync('moves/moves.json'))[pokemon]
}
