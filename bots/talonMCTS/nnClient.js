var log = require('log4js').getLogger("teamSimulator");

var BattleRoom = require("../../battleroom");
var getDexData = require("./../../util/getDexData").getDexData;
var randomChoice = require("./../../util/random");

var SpeciesNetwork = require("./networks/SpeciesNetwork");
var MoveNetwork = require("./networks/MoveNetwork");
var LevelNetwork = require("./networks/LevelNetwork");
var MatchDecisionNetwork = require("./networks/MatchDecisionNetwork");
var EvaluateNetwork = require("./networks/EvaluateNetwork1");

//TODO: Replace mocked DecisionPropCalcer with neural network
class NNClient {
    constructor(format){
      let [dexData, dex, moveDex] = getDexData(format);

      this.dex = dex;

      this.speciesNetwork = new SpeciesNetwork(format, dexData, dex, moveDex);
      this.moveNetwork = new MoveNetwork(format, dexData, dex, moveDex);
      this.levelNetwork = new LevelNetwork(format, dexData, dex, moveDex);
      this.matchDecisionNetwork = new MatchDecisionNetwork(format, dexData, dex, moveDex);
      this.evaluateNetwork = new EvaluateNetwork(format, dexData, dex, moveDex);
      this.timeSinceLastLog = Date.now();
    }
    
    getSpeciesChoice(team){
      let options = this.getSpeciesChoiceOptions(team);
      return randomChoice(options).species;
    }

    getSpeciesChoiceOptions(team){
      let noDuplicateDex = this.dex.filter(species => !team.some(pokemon => pokemon.species && pokemon.species == species));
      
      let speciesOptions = this.speciesNetwork.execTeam(team);

      return speciesOptions.filter(option => noDuplicateDex.includes(option.species));
    }

    getMoveChoice(team, legalOptions){
      return randomChoice(this.getMoveChoiceOptions(team, legalOptions));
    }

    getMoveChoiceOptions(team, legalOptions){
      let moveOptions = this.moveNetwork.execTeam(team);

      return moveOptions.filter(option => legalOptions.includes(option.move));
    }

    rememberBattleDecision(battlestate, options, decisionMade){
    }

    getRequestOptions(battle, decisionMaker, request){
      if(!request) request = battle[decisionMaker].request;
      let options = this.matchDecisionNetwork.getDecisionOdds(battle, decisionMaker, BattleRoom.parseRequest(request).choices);
      return options;
    }

    getLevelChoice(team){
      return randomChoice(this.getLevelChoiceOptions(team)).level;
    }

    getLevelChoiceOptions(team){
      return this.levelNetwork.execTeam(team);
    }

    evaluate(battle){
      return this.evaluateNetwork.evaluate(battle);
    }

    async loadNets() {
      await this.matchDecisionNetwork.load();
    }
}

let wrapperPool = new Map();

module.exports.getClient = function(format){
  let wrapper = wrapperPool.get(format);
  if (wrapper) return wrapper;

  wrapper = new NNClient(format);
  wrapperPool.set(format, wrapper);
  return wrapper;
}

module.exports.getClient = function(format){
  let wrapper = wrapperPool.get(format);
  if (wrapper) return wrapper;

  wrapper = new NNClient(format);
  wrapperPool.set(format, wrapper);
  return wrapper;
}