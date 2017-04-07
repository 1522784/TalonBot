var fs = require('fs');

var getdata = exports.getdata = function (pokemon, callback) {
    fs.readFile('moves/moves.json',function(err,content){
        callback(JSON.parse(content)[pokemon])
    })
}