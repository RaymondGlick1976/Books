// =============================================
// STRIPE CONFIG - Get publishable key
// =============================================

const { success, error, handleCors, validateSession } = require('./utils');

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;
  
  const customer = await validateSession(event);
  if (!customer) {
    return error('Unauthorized', 401);
  }
  
  return success({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  });
};
