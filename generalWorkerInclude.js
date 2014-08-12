define([], function () {
	"use strict";

	var useWorkers = !!window.Worker;

	var beforeCallback = function (evt, cb) {
		cb();
	};

	var WorkerManager = function (path, numberOfWorkers, setupMethod) {
		var workerWaitQueue = [], workerList = [], workersById = {};
		var idCount = 0;

		var MyWorker, WorkerPolyFill;

		var createWorker = function () {
			var newWorker, id;

			function finalizeWorker() {
				newWorker.busy = false;
				newWorker.setupDone();
				signalFree(id);
			}

			function setupWorker(event) {
				if (newWorker.removeEventListener) {
					newWorker.removeEventListener("error", function (e) {
						console.error(e);
					});
					newWorker.removeEventListener("message", setupWorker);
				}

				if (event.data === "ready") {
					if (typeof setupMethod === "object" && typeof setupMethod.setup === "function") {
						setupMethod.setup(newWorker, finalizeWorker);
					} else {
						finalizeWorker();
					}
				} else {
					throw new Error("did not get ready as first event");
				}
			}

			if (useWorkers) {
				id = ++idCount;
				newWorker = new MyWorker(id);

				workersById[idCount] = newWorker;
				workerList.push(newWorker);

				newWorker.addEventListener("error", function (e) {
					console.error(e);
				});
				newWorker.addEventListener("message", setupWorker);

				newWorker.postMessage({
					loadScript: path
				});
			} else {
				newWorker = new WorkerPolyFill(++idCount, setupWorker);

				workersById[idCount] = newWorker;
				workerList.push(newWorker);
			}
		};

		var exit = function (workerid) {
			var worker = workersById[workerid];

			workerList.slice(workerList.indexOf(worker), 1);
			delete workersById[workerid];
		};

		var signalFree = function (workerid) {
			var worker = workersById[workerid];
			if (typeof worker !== "undefined" && worker.busy === false) {
				var waiter = workerWaitQueue.shift();
				if (typeof waiter === "function") {
					waiter(null, worker);
				}
			}
		};

		WorkerPolyFill = function (workerid, setupCallback) {
			var theHandler;

			var that = this;
			var setup = true;

			this.busy = true;
			var listener = function () {};

			require([path], function (handler) {
				theHandler = handler;

				setupCallback({
					data: "ready"
				});
			});

			this.setupDone = function () {
				setup = false;
			};

			this.postMessage = function (message, theListener) {
				that.busy = true;
				if (theListener) {
					listener = theListener;
				}

				try {
					var result = theHandler({
						data: message
					});

					if (typeof result !== "undefined") {
						window.setTimeout(function () {
							beforeCallback({data: result}, function () {
								var saveListener = listener;

								that.busy = false;
								listener = function () {};

								if (!setup) {
									signalFree(workerid);
								}

								saveListener(null, result);
							});
						});
					}
				} catch (e) {
					window.setTimeout(function () {
						beforeCallback(e, function () {
							listener(e);

							that.exit();
						});
					});
				}
			};

			this.getId = function () {
				return workerid;
			};

			this.exit = function () {
				exit(workerid);
			};
		};

		MyWorker = function (workerid) {
			var that = this;
			var setup = true;

			var theWorker = new Worker("assets/js/cryptoWorker/generalWorker.js");

			this.busy = true;
			var listener = function () {};

			this.setupDone = function () {
				setup = false;
			};

			this.addEventListener = function () {
				theWorker.addEventListener.apply(theWorker, arguments);
			};

			this.removeEventListener = function () {
				theWorker.removeEventListener.apply(theWorker, arguments);
			};

			this.postMessage = function (message, theListener) {
				that.busy = true;
				if (theListener) {
					listener = theListener;
					//console.log(workerid + ":" + JSON.stringify(message));
					//console.time("workerJob" + workerid);
				}

				theWorker.postMessage(message);
			};

			this.exit = function () {
				exit(workerid);
				theWorker.terminate();
			};

			this.getId = function () {
				return workerid;
			};

			theWorker.onerror = function (event) {
				beforeCallback(event, function () {
					listener(event);

					that.exit();
				});
			};

			theWorker.onmessage = function (event) {
				beforeCallback(event, function () {
					//console.timeEnd("workerJob" + workerid);
					//console.debug(event.data);
					var saveListener = listener;

					that.busy = false;
					listener = function () {};

					if (!setup) {
						signalFree(workerid);
					}

					saveListener(null, event.data);
				});
			};
		};

		this.getFreeWorker = function (cb) {
			var i;
			for (i = 0; i < workerList.length; i += 1) {
				if (workerList[i].busy === false) {
					cb(null, workerList[i]);
					return;
				}
			}

			if (workerList.length < numberOfWorkers) {
				createWorker();
			}

			workerWaitQueue.push(cb);
		};

		createWorker();
	};

	WorkerManager.setBeforeCallBack = function (cb) {
		beforeCallback = cb;
	};

	return WorkerManager;
});