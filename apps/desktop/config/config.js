function load(envName) {
  return {
    ...loadConfig(envName),
    ...loadConfig("local"),
  };
}

function log(configObj) {
  const repeatNum = 50;
  // eslint-disable-next-line
  console.log(`${"=".repeat(repeatNum)}\nenvConfig`);
  // eslint-disable-next-line
  console.log(JSON.stringify(configObj, null, 2));
  // eslint-disable-next-line
  console.log(`${"=".repeat(repeatNum)}`);
}

function loadConfig(configName) {
  try {
    return require(`./${configName}.json`);
  } catch (e) {
    if (e instanceof Error && e.code === "MODULE_NOT_FOUND") {
      return {};
    } else {
      throw e;
    }
  }
}

module.exports = {
  load,
  log,
};
