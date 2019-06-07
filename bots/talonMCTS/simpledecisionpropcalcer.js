var math = require("mathjs")
var fs = require("fs")
var BattleRoom = require("./../../battleroom");
var NodeNeuralNetwork = require('node-neural-network'); // this line is not needed in the browser
var Neuron = NodeNeuralNetwork.Neuron,
    Layer = NodeNeuralNetwork.Layer,
    Network = NodeNeuralNetwork.Network,
    Trainer = NodeNeuralNetwork.Trainer,
    Architect = NodeNeuralNetwork.Architect;
var log = require('log4js').getLogger("teamSimulator");

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

class SpeciesNetwork {
  constructor(formatId, dexData, pokedex, movedex){
    this.dexData = dexData;
    this.pokedex = pokedex;
    this.movedex = movedex;

    this.inputLayer = new Array((pokedex.length + movedex.length + 100) * 6 + 1);
    this.outputLayer = new Array(pokedex.length);
    this.weights = JSON.parse(fs.readFileSync("./savedNeuralNetworks/teamNets/" + formatId + ".speciesChoiceWeights.json").toString());
    //log.info(this.weights);
  }

  activateForward(){
    for (let j = 0; j<this.outputLayer.length; j++) {
      this.outputLayer[j] = 0;
      for (let i = 0; i<this.inputLayer.length; i++)
        this.outputLayer[j] += this.inputLayer[i] * this.weights[j][i];
      this.outputLayer[j] = math.divide(1, math.add(1, math.pow(math.e, math.multiply(-1, this.outputLayer[j]))));
    }
  }

  teamToInput(team){
      let layer = new Array((this.pokedex.length + this.movedex.length + 100) * 6 + 1);
      for(let i = 0; i < layer.length; i++)
          layer[i] = 0;
  
      let pokeLayerLength = this.pokedex.length + this.movedex.length + 100;
      for(let teamIndex = 0; teamIndex < team.length; teamIndex++){
        if(!team[teamIndex].species) break;

        let layerIndex = pokeLayerLength * teamIndex;
        //Current Pokemon alway goes to last position for more consistent input.
        if(teamIndex === team.length - 1) layerIndex = pokeLayerLength * 5;
        let speciesIndex = this.pokedex.findIndex(speciesId => {
          return this.dexData.Pokedex[speciesId].species === team[teamIndex].species;
        });
        layer[layerIndex + speciesIndex] = 1;
  
        for(let m = 0; m < team[teamIndex].moves.length; m ++){
          let moveDexIndex = this.movedex.findIndex(moveId =>  moveId === team[teamIndex].moves[m]);
          layer[layerIndex + this.pokedex.length + moveDexIndex] = 1;
        }
  
        layer[layerIndex + this.pokedex.length + this.movedex.length + team[teamIndex].level - 1] = 1;
      }
  
      layer[layer.length - 1] = 1;//Bias neuron
  
      return layer;
  }

  execTeam(team){
    this.inputLayer = this.teamToInput(team);
    this.activateForward();
    return this.outputLayer.map((val, index) => {
      return {
        probability: val,
        species: this.pokedex[index]
      };
    });
  }
}

class MoveNetwork {
  constructor(formatId, dexData, pokedex, movedex){
    this.dexData = dexData;
    this.pokedex = pokedex;
    this.movedex = movedex;

    this.inputLayer = new Array((pokedex.length + movedex.length + 100) * 6 + 1);
    this.outputLayer = new Array(movedex.length);
    this.weights = JSON.parse(fs.readFileSync("./savedNeuralNetworks/teamNets/" + formatId + ".moveChoiceWeights.json").toString());
  }

  activateForward(){
    for (let j = 0; j<this.outputLayer.length; j++) {
      this.outputLayer[j] = 0;
      for (let i = 0; i<this.inputLayer.length; i++)
        this.outputLayer[j] += this.inputLayer[i] * this.weights[j][i];
      this.outputLayer[j] = math.divide(1, math.add(1, math.pow(math.e, math.multiply(-1, this.outputLayer[j]))));
    }
  }

  teamToInput(team){
      let layer = new Array((this.pokedex.length + this.movedex.length + 100) * 6 + 1);
      for(let i = 0; i < layer.length; i++)
          layer[i] = 0;
  
      let pokeLayerLength = this.pokedex.length + this.movedex.length + 100;
      for(let teamIndex = 0; teamIndex < team.length; teamIndex++){
          let layerIndex = pokeLayerLength * teamIndex;
          //Current Pokemon alway goes to last position for more consistent input.
          if(teamIndex === team.length - 1) layerIndex = pokeLayerLength * 5;
          let speciesIndex = this.pokedex.findIndex(speciesId => {
              return this.dexData.Pokedex[speciesId].species === team[teamIndex].species;
          });
          layer[layerIndex + speciesIndex] = 1;
  
          if(!team[teamIndex].moves) break;
          for(let m = 0; m < team[teamIndex].moves.length; m ++){
              let moveDexIndex = this.movedex.findIndex(moveId =>  moveId === team[teamIndex].moves[m]);
              layer[layerIndex + this.pokedex.length + moveDexIndex] = 1;
          }
  
          layer[layerIndex + this.pokedex.length + this.movedex.length + team[teamIndex].level - 1] = 1;
      }
  
      layer[layer.length - 1] = 1;//Bias neuron
  
      return layer;
  }

  execTeam(team){
    this.inputLayer = this.teamToInput(team);
    this.activateForward();
    return this.outputLayer.map((val, index) => {
      return {
        probability: val,
        move: this.movedex[index]
      };
    });
  }
}

class LevelNetwork {
  constructor(formatId, dexData, pokedex, movedex){
    this.dexData = dexData;
    this.pokedex = pokedex;
    this.movedex = movedex;

    this.inputLayer = new Array((pokedex.length + movedex.length + 100) * 6 + 1);
    this.outputLayer = new Array(100);
    this.weights = JSON.parse(fs.readFileSync("./savedNeuralNetworks/teamNets/" + formatId + ".levelChoiceWeights.json").toString());
  }

  activateForward(){
    for (let j = 0; j<this.outputLayer.length; j++) {
      this.outputLayer[j] = 0;
      for (let i = 0; i<this.inputLayer.length; i++)
        this.outputLayer[j] += this.inputLayer[i] * this.weights[j][i];
      this.outputLayer[j] = math.divide(1, math.add(1, math.pow(math.e, math.multiply(-1, this.outputLayer[j]))));
    }
  }

  teamToInput(team){
      let layer = new Array((this.pokedex.length + this.movedex.length + 100) * 6 + 1);
      for(let i = 0; i < layer.length; i++)
          layer[i] = 0;
  
      let pokeLayerLength = this.pokedex.length + this.movedex.length + 100;
      for(let teamIndex = 0; teamIndex < team.length; teamIndex++){
          let layerIndex = pokeLayerLength * teamIndex;
          //Current Pokemon alway goes to last position for more consistent input.
          if(teamIndex === team.length - 1) layerIndex = pokeLayerLength * 5;
          let speciesIndex = this.pokedex.findIndex(speciesId => {
              return this.dexData.Pokedex[speciesId].species === team[teamIndex].species;
          });
          layer[layerIndex + speciesIndex] = 1;
  
          if(!team[teamIndex].moves) break;
          for(let m = 0; m < team[teamIndex].moves.length; m ++){
              let moveDexIndex = this.movedex.findIndex(moveId =>  moveId === team[teamIndex].moves[m]);
              layer[layerIndex + this.pokedex.length + moveDexIndex] = 1;
          }
  
          if(team[teamIndex].level) layer[layerIndex + this.pokedex.length + this.movedex.length + team[teamIndex].level - 1] = 1;
      }
  
      layer[layer.length - 1] = 1;//Bias neuron
  
      return layer;
  }

  execTeam(team){
    this.inputLayer = this.teamToInput(team);
    this.activateForward();
    return this.outputLayer.map((val, index) => {
      return {
        probability: val,
        level: 1 + index
      };
    });
  }
}

module.exports = new SimpleDecisionPropCalcer()