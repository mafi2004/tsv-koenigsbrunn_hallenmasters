const Ajv = require('ajv');
const ajv = new Ajv({ allErrors: true, removeAdditional: true });

const schema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    generatedAt: { type: 'string' },
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          start: { type: 'string' },
          end:   { type: 'string' },
          group: { type: 'string' },
          round: { type: 'number' },
          field: { type: 'string' },
          team1: { type: 'string' },
          team2: { type: 'string' }
        },
        required: ['start','end','group','round','field','team1','team2']
      }
    }
  },
  required: ['title','generatedAt','matches']
};
const validate = ajv.compile(schema);

module.exports = async function (context, req) {
  try {
    const payload = req.body || {};
    if (!validate(payload)) {
      context.res = { status: 400, body: { ok:false, error:'Invalid payload', details: validate.errors } };
      return;
    }
    // Broadcast an Gruppe 'schedule'
    context.bindings.webPubSubOperation = {
      operationKind: 'sendToGroup',
      group: 'schedule',
      message: JSON.stringify(payload),
      dataType: 'json'
    };
    context.res = { status: 200, body: { ok: true } };
  } catch (e) {
    context.log.error(e);
    context.res = { status: 500, body: { ok:false, error: e.message || String(e) } };
  }
};
