var math = require("mathjs")
var fs = require("fs")
var BattleRoom = require("./../../battleroom");
var log = require('log4js').getLogger("teamSimulator");

var SpeciesNetwork = require("./networks/SpeciesNetwork");
var MoveNetwork = require("./networks/MoveNetwork");
var LevelNetwork = require("./networks/LevelNetwork");
var MatchDecisionNetwork = require("./networks/MatchDecisionNetwork");
var EvaluateNetwork = require("./networks/EvaluateNetwork1");

//TODO: Replace mocked DecisionPropCalcer with neural network
class SimpleDecisionPropCalcer {
    constructor(){
      this.speciesNetworkPool = new Map();
      this.moveNetworkPool = new Map();
      this.levelNetworkPool = new Map();
      this.matchDecisionNetworkPool = new Map();
      this.evaluateNetworkPool = new Map();
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

    getMatchDecisionNetwork(battleFormat, dexData, dex, moveDex){
      let matchDecisionNetwork = this.matchDecisionNetworkPool.get(battleFormat);
      if (matchDecisionNetwork) return matchDecisionNetwork;

      matchDecisionNetwork = new MatchDecisionNetwork(battleFormat, dexData, dex, moveDex);
      this.matchDecisionNetworkPool.set(battleFormat, matchDecisionNetwork);
      return matchDecisionNetwork;
    }

    getEvaluateNetwork(battleFormat, dexData, dex, moveDex){
      let evaluateNetwork = this.evaluateNetworkPool.get(battleFormat);
      if (evaluateNetwork) return evaluateNetwork;

      evaluateNetwork = new EvaluateNetwork(battleFormat, dexData, dex, moveDex);
      this.evaluateNetworkPool.set(battleFormat, evaluateNetwork);
      return evaluateNetwork;
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

      return speciesOptions.filter(option => noDuplicateDex.includes(option.species));
    }

    getMoveChoice(team, legalOptions, battleFormat, dexData, dex, moveDex){
      return this.randomChoice(this.getMoveChoiceOptions(team, legalOptions, battleFormat, dexData, dex, moveDex));
    }

    getMoveChoiceOptions(team, legalOptions, battleFormat, dexData, dex, moveDex){
      let network = this.getMoveNetwork(battleFormat, dexData, dex, moveDex);
      let moveOptions = network.execTeam(team);

      return moveOptions.filter(option => legalOptions.includes(option.move));
    }

    rememberBattleDecision(battlestate, options, decisionMade){
    }

    calculatePropabilities(battlestate, options){
		  for (var i = 0; i < this.options.length; i++) {
			  this.options[i].probability = math.divide(1, options.length);
		  }
    }

    getRequestOptions(battle, decisionMaker, request){
      if(!request) request = battle[decisionMaker].request;
      return this.getMatchDecisionNetwork(battle.format, battle.dataCache).getDecisionOdds(battle, decisionMaker, BattleRoom.parseRequest(request).choices);
      return BattleRoom.parseRequest(battle[decisionMaker].request).choices.map((option, index, arr) => {
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
      return network.execTeam(team);
    }

    evaluate(battle, battleFormat, dexData, dex, moveDex){
      let network = this.getEvaluateNetwork(battleFormat, dexData, dex, moveDex);
      return network.evaluate(battle);
    }

    async loadNets(battleFormat, dexData, dex, moveDex){
      this.getMoveNetwork(battleFormat, dexData, dex, moveDex);
      this.getLevelNetwork(battleFormat, dexData, dex, moveDex);
      this.getSpeciesNetwork(battleFormat, dexData, dex, moveDex);
      await this.getMatchDecisionNetwork(battleFormat, dexData, dex, moveDex).load();
      this.getEvaluateNetwork(battleFormat, dexData, dex, moveDex);
    }
}

module.exports = new SimpleDecisionPropCalcer()