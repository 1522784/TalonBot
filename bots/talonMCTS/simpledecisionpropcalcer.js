math = require("mathjs")

//TODO: Replaced mocked DecisionPropCalcer with neural network
class SimpleDecisionPropCalcer {
    constructor(){}

    randomChoice(options){
      let propSum = options.map(option => option.propability).reduce((prop1, prop2) => math.add(prop1, prop2));
      let rand = math.random(0, propSum);
      for (let option in options){
        rand = math.subtract(rand, options[option].propability);
        if(math.smallerEq(rand, 0)) return options[option]
      }
      throw new Error("mathjs is broken. ");
    }
    
    getSpeciesChoice(team, dex){
      let options = this.getSpeciesChoiceOptions(team, dex);
      return this.randomChoice(options).species;
    }

    getSpeciesChoiceOptions(team, dex){
      let noDuplicateDex = dex.filter(species => !team.some(pokemon => pokemon.species && pokemon.species.toLowerCase() == species.toLowerCase()));
      
      return noDuplicateDex.map(species => {
        return {
          species: species,
          propability: math.divide(1, noDuplicateDex.length)
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
          propability: math.divide(1, legalOptions.length)
        }
      });
    }

    rememberBattleDecision(battlestate, options, decisionMade){
    }

    calculatePropabilities(battlestate, options){
		  for (var i = 0; i < this.options.length; i++) {
			  this.options[i].propability = math.divide(1, options.length);
		  }
    }
}

module.exports = SimpleDecisionPropCalcer