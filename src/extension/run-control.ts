import clone from 'clone';
import { ListenForCb } from 'nodecg/types/lib/nodecg-instance'; // eslint-disable-line
import { NodeCG, Replicant } from 'nodecg/types/server'; // eslint-disable-line
import { RunDataActiveRunSurrounding } from '../../schemas';
import { RunData, RunDataActiveRun, RunDataArray } from '../../types';
import Helpers from './util/helpers';

let nodecg: NodeCG;

export default class RunControl {
  /* eslint-disable */
  private nodecg: NodeCG;
  private h: Helpers;
  private array: Replicant<RunDataArray>;
  private activeRun: Replicant<RunDataActiveRun>;
  private activeRunSurrounding: Replicant<RunDataActiveRunSurrounding>;
  /* eslint-enable */

  constructor(nodecg_: NodeCG) {
    nodecg = nodecg_;
    this.nodecg = nodecg;
    this.h = new Helpers(nodecg_);
    this.array = this.nodecg.Replicant('runDataArray');
    this.activeRun = this.nodecg.Replicant('runDataActiveRun');
    this.activeRunSurrounding = this.nodecg.Replicant('runDataActiveRunSurrounding');

    this.nodecg.listenFor('changeActiveRun', (id: string, ack): void => this.changeActiveRun(id, ack));
    this.nodecg.listenFor('changeToNextRun', (msg: undefined, ack): void => (
      this.changeActiveRun(this.activeRunSurrounding.value.next, ack)
    ));
    this.nodecg.listenFor('returnToStart', (msg: undefined, ack): void => this.removeActiveRun(ack));

    this.activeRun.on('change', (): void => this.changeSurroundingRuns());
    this.array.on('change', (): void => this.changeSurroundingRuns());
  }

  /**
   * Used to update the replicant that stores ID references to previous/current/next runs.
   */
  changeSurroundingRuns(): void {
    let previous: RunData | undefined;
    let current: RunData | undefined;
    let next: RunData | undefined;

    if (!this.activeRun.value) {
      // No current run set, we must be at the start, only set that one.
      [next] = this.array.value;
    } else {
      current = this.activeRun.value; // Current will always be the active one.

      // Try to find currently set runs in the run data array.
      const currentIndex = this.h.findRunIndexFromId(current.id);
      const previousIndex = this.h.findRunIndexFromId(this.activeRunSurrounding.value.previous);
      const nextIndex = this.h.findRunIndexFromId(this.activeRunSurrounding.value.next);

      if (currentIndex >= 0) { // Found current run in array.
        if (currentIndex > 0) {
          [previous,, next] = this.array.value.slice(currentIndex - 1);
        } else { // We're at the start and can't splice -1.
          [, next] = this.array.value.slice(0);
        }
      } else if (previousIndex >= 0) { // Found previous run in array, use for reference.
        [previous,, next] = this.array.value.slice(previousIndex);
      } else if (nextIndex >= 0) { // Found next run in array, use for reference.
        [previous,, next] = this.array.value.slice(nextIndex - 2);
      }
    }

    this.activeRunSurrounding.value = {
      previous: (previous) ? previous.id : undefined,
      current: (current) ? current.id : undefined,
      next: (next) ? next.id : undefined,
    };
  }

  /**
   * Change the active run to the one specified if it exists.
   * @param id The unique ID of the run you wish to change to.
   * @param ack Acknowledgement callback.
   */
  changeActiveRun(id?: string, ack?: ListenForCb): void {
    const runData = this.array.value.find((run): boolean => run.id === id);
    let err: Error | null = null;
    if (runData) {
      this.activeRun.value = clone(runData);
    } else if (!id) {
      err = new Error('No run ID was supplied.');
    } else {
      err = new Error(`Run with ID ${id} not found.`);
    }

    if (ack && !ack.handled) {
      ack(err);
    }
  }

  /**
   * Removes the active run from the relevant replicant.
   * @param ack Acknowledgement callback.
   */
  removeActiveRun(ack?: ListenForCb): void {
    this.activeRun.value = null;
    if (ack && !ack.handled) {
      ack(null);
    }
  }
}