var util = require('util');

function logState(log, battleState){
    log.info(battleState.p1.pokemon.map(poke => {
        let returnVal = {
            name: poke.name,
            health: poke.hp + "/" + poke.maxhp,
            moves: poke.moveSlots.map(move => move.id + " pp:" + move.pp),
            stats: poke.stats,
            level: poke.level
        }
        if(poke.transformed) returnVal.transformed = poke.transformed;
        if(poke.isActive) returnVal.isActive = poke.isActive;
        if(Object.keys(poke.boosts).some(boost => poke.boosts[boost] != 0)) returnVal.boosts = poke.boosts;
        if(poke.volatiles.id) returnVal.volatiles = util.inspect(poke.volatiles);
        if(poke.statusData.id) returnVal.statusData = poke.statusData;
        if(poke.switchFlag) returnVal.switchFlag = poke.switchFlag;
        return returnVal
    }))
    log.info(battleState.p2.pokemon.map(poke => {
        let returnVal = {
            name: poke.name,
            health: poke.hp + "/" + poke.maxhp,
            moves: poke.moveSlots.map(move => move.id + " pp:" + move.pp),
            stats: poke.stats,
            level: poke.level
        }
        if(poke.transformed) returnVal.transformed = poke.transformed;
        if(poke.isActive) returnVal.isActive = poke.isActive;
        if(Object.keys(poke.boosts).some(boost => poke.boosts[boost] != 0)) returnVal.boosts = poke.boosts;
        if(poke.isActive) returnVal.volatiles = util.inspect(poke.volatiles);
        if(poke.statusData.id) returnVal.statusData = poke.statusData;
        if(poke.switchFlag) returnVal.switchFlag = poke.switchFlag;
        return returnVal
    }))

}

module.exports = logState;