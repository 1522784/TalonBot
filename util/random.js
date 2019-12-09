var math = require("mathjs");

module.exports = function(options){
    let propSum = options.map(option => option.probability).reduce((prop1, prop2) => math.add(prop1, prop2));
    let rand = math.random(0, propSum);
    for (let option in options){
        rand = math.subtract(rand, options[option].probability);
        if(math.smallerEq(rand, 0)) return options[option];
    }
    throw new Error("mathjs is broken. Rest of random: " + rand);
}