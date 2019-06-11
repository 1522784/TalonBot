var math = require("mathjs")
var fs = require("fs")
var BattleRoom = require("./../../battleroom");
var log = require('log4js').getLogger("teamSimulator");

var SpeciesNetwork = require("./networks/SpeciesNetwork");
var MoveNetwork = require("./networks/MoveNetwork");
var LevelNetwork = require("./networks/LevelNetwork");

//TODO: Replace mocked DecisionPropCalcer with neural network
class SimpleDecisionPropCalcer {
    constructor(){
      this.speciesNetworkPool = new Map();
      this.moveNetworkPool = new Map();
      this.levelNetworkPool = new Map();
    }

    getMoveNetwork(battleFormat, dexData, dex, moveDex){
      let moveNetwork = this.moveNetworkPool.get(battleFormat);
      if (moveNetwork) return moveNetwork;

      moveNetwork = new MoveNetwork(battleFormat, dexData, dex, moveDex);
      this.moveNetworkPool.set(battleFormat, moveNetwork);
      return moveNetwork;
    }

    getLevelNetwork(battleFormat, dexData, dex, moveDex){
      let levelNetwork = this.levelNetworkPool.get(battleFormat);
      if (levelNetwork) return levelNetwork;

      levelNetwork = new LevelNetwork(battleFormat, dexData, dex, moveDex);
      this.levelNetworkPool.set(battleFormat, levelNetwork);
      return levelNetwork;
    }

    getSpeciesNetwork(battleFormat, dexData, dex, moveDex){
      let speciesNetwork = this.speciesNetworkPool.get(battleFormat);
      if (speciesNetwork) return speciesNetwork;

      speciesNetwork = new SpeciesNetwork(battleFormat, dexData, dex, moveDex);
      this.speciesNetworkPool.set(battleFormat, speciesNetwork);
      return speciesNetwork;
    }

    randomChoice(options){
      let propSum = options.map(option => option.probability).reduce((prop1, prop2) => math.add(prop1, prop2));
      let rand = math.random(0, propSum);
      for (let option in options){
        rand = math.subtract(rand, options[option].probability);
        if(math.smallerEq(rand, 0)) return options[option]
      }
      throw new Error("mathjs is broken. Rest of random: " + rand);
    }
    
    getSpeciesChoice(team, battleFormat, dexData, dex, moveDex){
      let options = this.getSpeciesChoiceOptions(team, battleFormat, dexData, dex, moveDex);
      return this.randomChoice(options).species;
    }

    getSpeciesChoiceOptions(team, battleFormat, dexData, dex, moveDex){
      let noDuplicateDex = dex.filter(species => !team.some(pokemon => pokemon.species && pokemon.species == species));
      
      let network = this.getSpeciesNetwork(battleFormat, dexData, dex, moveDex);
      let speciesOptions = network.execTeam(team);

      speciesOptions = speciesOptions.filter(option => noDuplicateDex.includes(option.species));
      
      /*let propsum = 0;
      for(let i = 0; i < speciesOptions.length; i++){
        propsum = math.add(propsum, speciesOptions[i].probability);
      }
      for(let i = 0; i < speciesOptions.length; i++){
        speciesOptions[i].probability = math.multiply(math.divide(speciesOptions[i].probability, propsum), 100);
      }*/

      //log.info(speciesOptions);
      return speciesOptions;
    }

    getMoveChoice(team, legalOptions, battleFormat, dexData, dex, moveDex){
      return this.randomChoice(this.getMoveChoiceOptions(team, legalOptions, battleFormat, dexData, dex, moveDex));
    }

    getMoveChoiceOptions(team, legalOptions, battleFormat, dexData, dex, moveDex){
      let network = this.getMoveNetwork(battleFormat, dexData, dex, moveDex);
      let moveOptions = network.execTeam(team);

      moveOptions = moveOptions.filter(option => legalOptions.includes(option.move));
      
      let propsum = 0;
      /*for(let i = 0; i < moveOptions.length; i++){
        propsum = math.add(propsum, moveOptions[i].probability);
      }
      for(let i = 0; i < moveOptions.length; i++){
        moveOptions[i].probability = math.multiply(math.divide(moveOptions[i].probability, propsum), 100);
      }*/

      //log.info(moveOptions);
      return moveOptions;
    }

    rememberBattleDecision(battlestate, options, decisionMade){
    }

    calculatePropabilities(battlestate, options){
		  for (var i = 0; i < this.options.length; i++) {
			  this.options[i].probability = math.divide(1, options.length);
		  }
    }

    getRequestOptions(request){
      return BattleRoom.parseRequest(request).choices.map((option, index, arr) => {
        return {
          decision: option,
          probability: math.divide(1, arr.length)
        };
      });
    }

    getLevelChoice(team, battleFormat, dexData, dex, moveDex){
      return this.randomChoice(this.getLevelChoiceOptions(team, battleFormat, dexData, dex, moveDex)).level;
    }

    getLevelChoiceOptions(team, battleFormat, dexData, dex, moveDex){
      let network = this.getLevelNetwork(battleFormat, dexData, dex, moveDex);
      let levelOptions = network.execTeam(team);
      
      let propsum = 0;
      for(let i = 0; i < levelOptions.length; i++){
        propsum = math.add(propsum, levelOptions[i].probability);
      }
      for(let i = 0; i < levelOptions.length; i++){
        levelOptions[i].probability = math.multiply(math.divide(levelOptions[i].probability, propsum), 100);
      }

      //log.info(levelOptions);
      return levelOptions;
    }
}

module.exports = new SimpleDecisionPropCalcer()