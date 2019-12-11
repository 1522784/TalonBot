var fs = require('fs');

exports.getdata = function (pokemon) {
    return JSON.parse(fs.readFileSync('moves.json'))[pokemon]
}