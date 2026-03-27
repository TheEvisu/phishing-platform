module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  roots: ['<rootDir>/apps', '<rootDir>/libs'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleNameMapper: {
    '@app/shared/(.*)': '<rootDir>/libs/shared/src/$1',
    '@app/shared': '<rootDir>/libs/shared/src',
  },
  coverageDirectory: './coverage',
  testEnvironment: 'node',
};
