import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3001),
  MONGODB_URI: Joi.string().default('mongodb://localhost:27017/phishing-management'),
  JWT_SECRET: Joi.string().min(32).required(),
  INTERNAL_SECRET: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).required(),
    otherwise: Joi.string().optional(),
  }),
  SMTP_ENCRYPTION_KEY: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).required(),
    otherwise: Joi.string().min(32).default('dev-smtp-encryption-key-32chars!!'),
  }),
  CORS_ORIGIN: Joi.string().default('http://localhost:5173'),
  PHISHING_SIMULATION_URL: Joi.string().uri().default('http://localhost:3000'),
  APP_VERSION: Joi.string().default('0.0.1'),
});
