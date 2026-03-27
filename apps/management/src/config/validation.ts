import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3001),
  MONGODB_URI: Joi.string().default('mongodb://localhost:27017/phishing-management'),
  JWT_SECRET: Joi.string().min(32).required(),
  CORS_ORIGIN: Joi.string().default('http://localhost:5173'),
  PHISHING_SIMULATION_URL: Joi.string().uri().default('http://localhost:3000'),
});
