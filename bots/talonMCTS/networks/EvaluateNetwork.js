var math = require("mathjs");
var fs = require("fs");
var Battle = require("./../../../servercode/sim/battle");
var TeamValidator = require("./../../../servercode/sim/team-validator").Validator;

const LEARN_RATE = 0.01;

/**
 * @typedef {{Pokedex: DexTable<Template>, Movedex: DexTable<Move>, Statuses: DexTable<EffectData>, TypeChart: DexTable<TypeData>, Scripts: DexTable<AnyObject>, Items: DexTable<Item>, Abilities: DexTable<Ability>, FormatsData: DexTable<ModdedTemplateFormatsData>, Learnsets: DexTable<{learnset: {[k: string]: MoveSource[]}}>, Aliases: {[id: string]: string}, Natures: DexTable<{[l: string]: string | undefined, name: string, plus?: string, minus?: string}>, Formats: DexTable<Format>}} DexTableData 
 * */

class EvaluateNetwork {
	/**
	 * @param {string} formatId
   * @param {?DexTableData} dexData
   * @param {string[]} pokedex
   * @param {string[]} movedex
	 */
  constructor(formatId, dexData, pokedex, movedex){
      let self = this;
      /** @type {?DexTableData} */
      this.dexData = dexData;

      let teamValidator = new TeamValidator(formatId);

      /**@type string[] */
      this.simpleStatusProblems = ["brn", "frz", "par", "psn", "tox"];
      /**@type string[] */
      this.durationDependentStatusProblems = ["slp"];
      /**@type string[] */
      this.simpleVolatiles = ["mustrecharge", "parspeeddrop", "focusenergy", "brnattackdrop"];
      /**@type string[] */
      this.durationDependentVolatiles = ["confusion", "partiallytrapped", "partiallytrappinglock", "stall", "residualdmg"];
      /**@type string[] */
      this.moveAndDurationDependentVolatiles = ["lockedMove"];
      
      /**@type string[] */
      this.typeDex = Object.keys(dexData.TypeChart);
      /**@type string[] */
      this.pokedex = Object.keys(this.dexData.Pokedex); //Includes all species from all Gens
      //log.info(dexData.Movedex)
      this.movedex = [];
      //for(let entry in dex) log.info(this.teamValidator.validateSet({species: dex[entry]}))
      this.pokedex = this.pokedex.filter(entry => { 
          let problems = teamValidator.validateSet({species: entry}, {});
          return (problems.length === 1); //If it is legal, only one problem must exist: "Pokemon has no moves"
      })
      this.pokedex.forEach(poke => {
          Object.keys(dexData.Learnsets[poke].learnset).forEach(move => {
              if(!self.movedex.includes(move)) self.movedex.push(move);
          })
      });
  
      this.inputLayer = [];
      this.hiddenLayer1 = new Array(200);
      this.hiddenLayer1[199] = 1;//Bias
      this.hiddenLayer2 = new Array(200);
      this.hiddenLayer2[199] = 1;//Bias
      this.output = -1;

      if(fs.existsSync("./savedNeuralNetworks/teamNets/" + formatId + ".evaluateWeights1.json")){
        this.weights1 = JSON.parse(fs.readFileSync("./savedNeuralNetworks/teamNets/" + formatId + ".evaluateWeights1.json").toString());
      }
      if(fs.existsSync("./savedNeuralNetworks/teamNets/" + formatId + ".evaluateWeights2.json")){
        this.weights2 = JSON.parse(fs.readFileSync("./savedNeuralNetworks/teamNets/" + formatId + ".evaluateWeights2.json").toString());
      }
      if(fs.existsSync("./savedNeuralNetworks/teamNets/" + formatId + ".evaluateWeights3.json")){
        this.weights3 = JSON.parse(fs.readFileSync("./savedNeuralNetworks/teamNets/" + formatId + ".evaluateWeights3.json").toString());
      }
    }

    /**
     * @param {Battle} battle
     * @param {string} decisionMaker is either p1 or p2
     */
    evaluate(battle, ownSide){
      let self = this;
      this.setInput(battle, ownSide);
      this.initWeights();

      this.activateForward();
      if(isNaN(this.output)) {
        debugger;
        this.setInput(battle, true);
        this.activateForward(true);
      }

      return this.output;
    }

    /**
     * @param {Battle} battle
     */
    setInput(battle, weAre){
      //BIAS neuron
      this.inputLayer = [1];
      
      //Set order. Decisionmaker is defined in the first input half.
      let sides = weAre === "p1" ? [battle.p1, battle.p2] : [battle.p2, battle.p1];

      let speciesInput = new Array(this.pokedex.length);
      let baseMoveSlotInput = new Array(this.movedex.length * 2);
      let levelInput = new Array(100);
      let simpleStatProbInput = new Array(this.simpleStatusProblems.length);
      let durationBasedStatProbInput = new Array(this.durationDependentStatusProblems.length * 2);
      let simpleVolatileInput = new Array(this.simpleVolatiles.length);
      let durationBasedVolatileInput = new Array(this.durationDependentVolatiles.length * 2);
      let moveSlotInput = new Array(this.movedex.length);
      let typesInput = new Array(this.typeDex.length);
      let boostsInput = new Array(7);
      let hpInput = new Array(800);
      let modifiedStatsInput = new Array(5);

      for(let side of sides){
        for(let pokemon of side.pokemon){
          let fainted = pokemon.hp === 0;

          let speciesIndex = this.pokedex.findIndex(speciesId => {
              return speciesId === pokemon.template.id;
          });
          for(let i = 0; i < speciesInput.length; i++) speciesInput[i] = 0;
          if(!fainted) speciesInput[speciesIndex] = 1;
          this.inputLayer.push(...speciesInput);
          
          for(let i = 0; i < baseMoveSlotInput.length; i++) baseMoveSlotInput[i] = 0;
          //debugger;
          for(let baseMoveSlot of pokemon.baseMoveSlots){
            let inputIndex = this.movedex.indexOf(baseMoveSlot.id) * 2;
            if(!fainted) baseMoveSlotInput[inputIndex] = 1;
            //baseMoveSlotInput[inputIndex + 1] = baseMoveSlot.pp;
          }
          this.inputLayer.push(...baseMoveSlotInput);

          for(let i = 0; i < hpInput.length; i++) hpInput[i] = 0;
          for(let i = 0; i < pokemon.hp; i++) hpInput[i] = 1;
          this.inputLayer.push(...hpInput);

          for(let i = 0; i < simpleStatProbInput.length; i++) simpleStatProbInput[i] = 0;
          //debugger;
          let statusIndex = this.simpleStatusProblems.indexOf(pokemon.status);
          if(statusIndex !== -1 && !fainted) simpleStatProbInput[statusIndex] = 1;
          this.inputLayer.push(...simpleStatProbInput);

          for(let i = 0; i < durationBasedStatProbInput.length; i++) durationBasedStatProbInput[i] = 0;
          //debugger;
          statusIndex = this.durationDependentStatusProblems.indexOf(pokemon.status);
          if(statusIndex !== -1) {
            if(!fainted) durationBasedStatProbInput[statusIndex * 2] = 1;
            if(!fainted) durationBasedStatProbInput[statusIndex * 2 + 1] = pokemon.statusData.time;
          }
          this.inputLayer.push(...durationBasedStatProbInput);

          for(let i = 0; i < moveSlotInput.length; i++) moveSlotInput[i] = 0;
          //debugger;
          if(!pokemon.trueMoves) pokemon.trueMoves = [];
          for(let trueMove of pokemon.trueMoves){
            if(!fainted) moveSlotInput[this.movedex.indexOf(trueMove)] = 1;
          }
          this.inputLayer.push(...moveSlotInput);

          for(let i = 0; i < typesInput.length; i++) typesInput[i] = 0;
          //debugger;
          for(let type of pokemon.types){
            if(!fainted) typesInput[this.typeDex.indexOf(type)] = 1;
          }
          this.inputLayer.push(...typesInput);

          if(side.active.includes(pokemon)){
            for(let i = 0; i < simpleVolatileInput.length; i++) simpleVolatileInput[i] = 0;
            //debugger;
            for(let volatile of Object.keys(pokemon.volatiles)){
              let index = this.simpleVolatiles.indexOf(volatile);
              if(!fainted) if(index !== -1) simpleVolatileInput[index] = 1;
            }
            this.inputLayer.push(...simpleVolatileInput);

            for(let i = 0; i < durationBasedVolatileInput.length; i++) durationBasedVolatileInput[i] = 0;
            //debugger;
            for(let volatile of Object.keys(pokemon.volatiles)){
              let index = this.durationDependentVolatiles.indexOf(volatile);
              if(index !== -1) {
                if(!fainted) durationBasedVolatileInput[index * 2] = 1;
                let time = pokemon.volatiles[volatile].duration;
                if(time === undefined) time = pokemon.volatiles[volatile].time;
                if(time === undefined) time = pokemon.volatiles[volatile].counter;
                if(!fainted) durationBasedVolatileInput[index * 2 + 1] = time;
              }
            }
            this.inputLayer.push(...durationBasedVolatileInput);

            if(pokemon.volatiles.substitute && !fainted){
              this.inputLayer.push(1, pokemon.volatiles.substitute.hp)
            } else {
              this.inputLayer.push(0, 0)
            }

            for(let i = 0; i < boostsInput.length; i++) boostsInput[i] = 0;
            for(let i = 0; i < 7; i++) {
              let boostNumber = pokemon.boosts[["accuracy", "evasion", "atk", "def", "spa", "spd", "spe"][i]]
              if(!fainted) boostsInput[i * 13 + 6 + boostNumber] = 1;
            }
            this.inputLayer.push(...boostsInput);

            for(let i = 0; i < modifiedStatsInput.length; i++) {
              modifiedStatsInput[i] = math.divide(pokemon.modifiedStats[["atk", "def", "spa", "spd", "spe"][i]], 100)
            }
            this.inputLayer.push(...modifiedStatsInput);

          }
        }
      }
    }

    activateForward(debugEverywhere){
      for (let j = 0; j<this.hiddenLayer1.length -1; j++) {
        this.hiddenLayer1[j] = 0;
        for (let i = 0; i<this.inputLayer.length; i++){
          this.hiddenLayer1[j] += this.inputLayer[i] * this.weights1[j][i];
        }
        this.hiddenLayer1[j] = math.subtract(math.multiply(math.divide(1, math.add(1, math.pow(math.e, math.multiply(-1, this.hiddenLayer1[j])))), 2), 1);
      }

      for (let j = 0; j<this.hiddenLayer2.length -1; j++) {
        this.hiddenLayer2[j] = 0;
        for (let i = 0; i<this.hiddenLayer1.length; i++){
          this.hiddenLayer2[j] += this.hiddenLayer1[i] * this.weights2[j][i];
        }
        this.hiddenLayer2[j] = math.subtract(math.multiply(math.divide(1, math.add(1, math.pow(math.e, math.multiply(-1, this.hiddenLayer2[j])))), 2), 1);
      }

      this.output = 0;
      for (let i = 0; i<this.hiddenLayer2.length; i++){
        this.output += this.hiddenLayer2[i] * this.weights3[0][i];
      }
      this.output = math.subtract(math.multiply(math.divide(1, math.add(1, math.pow(math.e, math.multiply(-1, this.output)))), 2), 1);
    }

    initWeights(){
      if(!this.weights1 || this.weights1.length < this.hiddenLayer1.length - 1 || this.weights1[0].length < this.inputLayer.length){
        this.weights1 = new Array(this.hiddenLayer1.length - 1);
        for(let j = 0; j < this.weights1.length; j++){
          this.weights1[j] = new Array(this.inputLayer.length);
          for(let i = 0; i < this.weights1[j].length; i++)
            this.weights1[j][i] = math.random(-1, 1);
        }
      }

      if(!this.weights2 || this.weights2.length < this.hiddenLayer2.length - 1 || this.weights2[0].length < this.hiddenLayer1.length){
        this.weights2 = new Array(this.hiddenLayer2.length - 1);
        for(let j = 0; j < this.weights2.length; j++){
          this.weights2[j] = new Array(this.hiddenLayer1.length);
          for(let i = 0; i < this.weights2[j].length; i++)
            this.weights2[j][i] = math.random(-1, 1);
        }
      }

      if(!this.weights3 || this.weights3.length < 1 || this.weights3[0].length < this.hiddenLayer2.length){
        this.weights3 = new Array(1);
        for(let j = 0; j < this.weights3.length; j++){
          this.weights3[j] = new Array(this.hiddenLayer2.length);
          for(let i = 0; i < this.weights3[j].length; i++)
            this.weights3[j][i] = math.random(-1, 1);
        }
      }
    }

    save(){
      fs.writeFileSync("./savedNeuralNetworks/" + this.formatId + ".evaluateWeights1.json", JSON.stringify(this.weights1));
      fs.writeFileSync("./savedNeuralNetworks/" + this.formatId + ".evaluateWeights2.json", JSON.stringify(this.weights2));
      fs.writeFileSync("./savedNeuralNetworks/" + this.formatId + ".evaluateWeights3.json", JSON.stringify(this.weights3));
    }

    load(){
      if(fs.existsSync("./savedNeuralNetworks/" + this.formatId + ".evaluateWeights1.json")){
        this.weights1 = JSON.parse(fs.readFileSync("./savedNeuralNetworks/" + this.formatId + ".evaluateWeights1.json").toString());
      }
      if(fs.existsSync("./savedNeuralNetworks/" + this.formatId + ".evaluateWeights2.json")){
        this.weights2 = JSON.parse(fs.readFileSync("./savedNeuralNetworks/" + this.formatId + ".evaluateWeights2.json").toString());
      }
      if(fs.existsSync("./savedNeuralNetworks/" + this.formatId + ".evaluateWeights3.json")){
        this.weights3 = JSON.parse(fs.readFileSync("./savedNeuralNetworks/" + this.formatId + ".evaluateWeights3.json").toString());
      }
    }

    train(battle, ownSide, winner){
      this.evaluate(battle, ownSide);

      let errGradientsHidden2 = [];
      for(let i in this.hiddenLayer2) errGradientsHidden2.push(0);

      let expectedVal = (winner === ownSide) ? 1 : -1;
      let diff = this.output - expectedVal;

      let funGradient = 1;//(this.output + 1) * (1 - this.output);
      let errGradient = diff * funGradient;

      let j = 0;
      for(let i in this.weights3[j]){
        this.weights3[j][i] -= LEARN_RATE * errGradient * this.hiddenLayer2[i];
        if(!this.weights3[j][i]) throw new Error("Weight in before output is " + this.weights3[j][i] + " in index " + j + " " + i);
        errGradientsHidden2[i] += this.weights3[j][i] * errGradient;
      }
      
      let errGradientsHidden1 = [];
      for(let h in this.hiddenLayer2) errGradientsHidden1.push(0);

      for(let i in this.weights2){
        for(let h in this.weights2[i]){
          this.weights2[i][h] -= LEARN_RATE * errGradientsHidden2[i] * this.hiddenLayer1[h];
          if(!this.weights2[i][h]) throw new Error("Weight in before secound hidden layer is " + this.weights2[i][h] + " in index " + i + " " + h);
          errGradientsHidden1[h] += this.weights2[i][h] * errGradientsHidden2[i];
        }
      }

      for(let h in this.weights1){
        for(let g in this.weights1[h]){
          this.weights1[h][g] -= LEARN_RATE * errGradientsHidden1[h] * this.inputLayer[g];
        if(!this.weights1[h][g]) throw new Error("Weight in before first hidden layer is " + this.weights1[h][g] + " in index " + h + " " + g);
        }
      }
    }
}

module.exports = EvaluateNetwork;