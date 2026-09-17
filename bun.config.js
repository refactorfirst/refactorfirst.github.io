export default {
  test: {
    environment: 'jsdom',
    coverage: {
      reporter: ['text', 'html'],
      include: ['lib/**/*.js'],
      exclude: ['tests/']
    }
  }
};
