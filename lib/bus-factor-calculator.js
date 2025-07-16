import { ABFBusFactorCalculator } from './abf-bus-factor-calculator.js';
import { JBFBusFactorCalculator } from './jbf-bus-factor-calculator.js';
import { EventEmitter } from 'events';

export class BusFactorCalculator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.quiet = options.quiet || false;
    this.options = options;
    this.calculators = {
      abf: new ABFBusFactorCalculator({ quiet: this.quiet }),
      jbf: new JBFBusFactorCalculator({ quiet: this.quiet })
    };
    
    // Forward events from sub-calculators
    Object.values(this.calculators).forEach(calculator => {
      if (calculator && typeof calculator.on === 'function') {
        calculator.on('info', (msg) => this.emit('info', msg));
        calculator.on('warning', (msg) => this.emit('warning', msg));
        calculator.on('progress', (data) => this.emit('progress', data));
      }
    });
  }

  async calculate(method, fileAuthorship, analysisData) {
    const calculator = this.calculators[method];
    if (!calculator) {
      throw new Error(`Unknown bus factor calculation method: ${method}`);
    }

    if (!this.quiet) {
      this.emit('info', `\n🚌 Running bus factor calculation with method: ${method.toUpperCase()}`);
    }
    
    switch (method) {
      case 'abf':
        const abfResult = calculator.calculateABF(fileAuthorship);
        return calculator.generateReport(analysisData, abfResult);
      case 'jbf':
        const jbfResult = await calculator.calculateJBF(fileAuthorship, analysisData);
        return calculator.generateReport(analysisData, jbfResult);
      default:
        throw new Error(`Method ${method} not implemented`);
    }
  }

  listAvailableMethods() {
    return Object.keys(this.calculators);
  }
}