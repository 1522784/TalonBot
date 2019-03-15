var math = require("mathjs")
var log = require('log4js').getLogger("teamSimulator");

var RandomTeams = require("./../../servercode/data/random-teams")

class PossibleTeam {
	constructor(battle, decisionPropCalcer, teamValidator, dex, lead) {
        let self = this;
        this.rank = 1;
        this.decisionPropCalcer = decisionPropCalcer;
        this.teamValidator = teamValidator;
        this.dex = dex;

        this.team = [];
        
        //log.info(Object.keys(this.teamValidator.ruleTable));
        //log.info(Object.keys(this.teamValidator.format));
        //log.info(this.teamValidator.format.banlist[0]);
        //log.info(this.teamValidator.format.ruleset);
        //log.info(Object.keys(this.teamValidator.dex.loadData().Pokedex));
        //for(let poke in pokedex) log.info("Species: " + pokedex[poke]);

        let leadIndex = battle.p2.pokemon.findIndex(poke => poke.species.toLowerCase() === lead.toLowerCase());

        for(let i = 0; i < 6; i++){
            this.team.push({});

            let registeredPokemon;
            if(i==0)
                registeredPokemon = battle.p2.pokemon[leadIndex];
            else if(i<=leadIndex){
                registeredPokemon = battle.p2.pokemon[i-1];
            } else if(i>leadIndex){
                registeredPokemon = battle.p2.pokemon[i];
            }

            if(registeredPokemon){
                let options = this.decisionPropCalcer.getSpeciesChoiceOptions(this.team, dex)
                this.team[i].species = registeredPokemon.species;
                this.rank = math.multiply(this.rank, options.find(option => option.species === registeredPokemon.species.toLowerCase()).propability);
            } else {
                this.team[i].species = this.decisionPropCalcer.getSpeciesChoice(this.team, dex)
            }

            //log.info(this.teamValidator.dex.getTemplate(this.team[i].species.toLowerCase()))
            this.team[i].moves = [];
            for(let j = 0; j < 4; j++){
                let legalMoveOptions = Object.keys(this.teamValidator.dex.getTemplate(this.team[i].species.toLowerCase()).learnset)
                legalMoveOptions = legalMoveOptions.filter(move => { 
                    let problems = teamValidator.validateSet({species: self.team[i].species, moves: self.team[i].moves.concat(move)}, {});
                    return (!problems);
                }).filter(move => !self.team[i].moves.includes(move));
                if(!legalMoveOptions.length) break;

                if(registeredPokemon && registeredPokemon.trueMoves[j]){
                    let options = this.decisionPropCalcer.getMoveChoiceOptions(this.team, j, legalMoveOptions);
                    this.team[i].moves.push(registeredPokemon.trueMoves[j]);
                    this.rank = math.multiply(this.rank, options.find(option => option.move.toLowerCase() === registeredPokemon.trueMoves[j].toLowerCase()).propability)
                } else {
                    this.team[i].moves.push(this.decisionPropCalcer.getMoveChoice(this.team, j, legalMoveOptions).move);
                }

            }
        }
            
        log.info(this.team);
        log.info(this.rank);

    }

    updateRank(battleLog, depth){
        log.info("updateRank not implemented.")
    }

    isStillPossible(battle){
        let opponentTeam = battle.p2.pokemon
        for(let oppTeamIndex in opponentTeam){
            let simulatedPokemon = this.team.find(simulatedPokemon => simulatedPokemon.species.toLowerCase() === opponentTeam[oppTeamIndex].species.toLowerCase())
            log.info(simulatedPokemon)
            if(!simulatedPokemon) return false;
            
            for(let moveIndex in opponentTeam[oppTeamIndex].trueMoves){
                if(!simulatedPokemon.moves.find(move => move.toLowerCase() === opponentTeam[oppTeamIndex].trueMoves[moveIndex].toLowerCase()))
                    return false;
            }
        }
        return true
    }

    getRank(){
        return this.rank;
    }

    getMoveChoice(battle, pokemonIndex, moveIndex){
        let species = this.team[pokemonIndex].species;

        if(this.teamValidator.format.team){//If teams are randomly generated
            let randomizer = new RandomTeams(this.teamValidator.format, this.prng);
            let template = randomizer.getTemplate(species)

            if(template.essentialMove && !this.team[pokemonIndex].moves.includes(template.essentialMove))
                return template.essentialMove;

            let pool = template.randomBattleMoves.filter(moveid => !(this.team[pokemonIndex].moves.includes(moveid) || randomizer.data.Movedex[moveid].isZ))
			if (pool.length) {
				return pool[0];
            }

            let randomMove;
            do {
                randomMove = randomizer.sample(template.exclusiveMoves)
            }while(this.team[pokemonIndex].moves.includes(randomMove))
            return randomMove;
        }

        //TODO: Implement
        return "bulbasaur"
    }

    speciesExists(species){
        return this.team[i].some(pokemon => pokemon.species == species);
    }
}

module.exports = PossibleTeam