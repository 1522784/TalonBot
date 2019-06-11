var math = require("mathjs")
var fs = require("fs")

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

  module.exports = MoveNetwork;