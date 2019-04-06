math = require("mathjs")
var BattleRoom = require("./../../battleroom");

//TODO: Replaced mocked DecisionPropCalcer with neural network
class SimpleDecisionPropCalcer {
    constructor(){}

    randomChoice(options){
      let propSum = options.map(option => option.probability).reduce((prop1, prop2) => math.add(prop1, prop2));
      let rand = math.random(0, propSum);
      for (let option in options){
        rand = math.subtract(rand, options[option].probability);
        if(math.smallerEq(rand, 0)) return options[option]
      }
      throw new Error("mathjs is broken. ");
    }
    
    getSpeciesChoice(team, dex){
      let options = this.getSpeciesChoiceOptions(team, dex);
      return this.randomChoice(options).species;
    }

    getSpeciesChoiceOptions(team, dex){
      let noDuplicateDex = dex.filter(species => !team.some(pokemon => pokemon.species && pokemon.species == species));
      
      return noDuplicateDex.map(species => {
        return {
          species: species,
          probability: math.divide(1, noDuplicateDex.length)
        }
      });
    }

    getMoveChoice(team, pokemonIndex, legalOptions){
      return this.randomChoice(this.getMoveChoiceOptions(team, pokemonIndex, legalOptions));
    }

    getMoveChoiceOptions(team, pokemonIndex, legalOptions){
      
      return legalOptions.map(move => {
        return {
          move: move,
          probability: math.divide(1, legalOptions.length)
        }
      });
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

    getLevelChoice(){
      return 100;
    }

    getLevelChoiceOptions(){
      let options = [];
      for(let i = 1; i <= 100; i++){
        options.push({
          level: i,
          probability: 0.01
        });
      }
      return options;
    }
}

module.exports = SimpleDecisionPropCalcer