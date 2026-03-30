import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  MONGODB_URI: Joi.string().default('mongodb://localhost:27017/phishing-simulation'),
  SMTP_HOST: Joi.string().default('smtp.gmail.com'),
  SMTP_PORT: Joi.number().default(587),
  SMTP_USER: Joi.string().required(),
  SMTP_PASS: Joi.string().required(),
  SMTP_FROM: Joi.string().email().default('noreply@phishingtest.com'),
  APP_URL: Joi.string().uri().default('http://localhost:3000'),
  MANAGEMENT_URL: Joi.string().uri().default('http://localhost:3001'),
  INTERNAL_SECRET: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).required(),
    otherwise: Joi.string().optional(),
  }),
});
