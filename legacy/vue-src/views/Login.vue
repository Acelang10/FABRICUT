<template>
  <main class="login-page">
    <section class="login-card">
      <img src="@/assets/logo.jpg" alt="JCM Tailoring" class="login-logo">
      <h1>Welcome back</h1>
      <p class="login-subtitle">Sign in to access the Fabricut Controller.</p>

      <form @submit.prevent="submitLogin">
        <p>Use an explicitly approved staff Google account.</p>
        <p v-if="errorMessage" class="login-error">{{ errorMessage }}</p>
        <button class="login-button" type="submit" :disabled="isSubmitting">
          {{ isSubmitting ? 'Signing in...' : 'Sign in with Google' }}
        </button>
      </form>

      <router-link class="back-link" to="/">Back to home</router-link>
    </section>
  </main>
</template>

<script>
import { useAuth } from '@/composables/auth'

export default {
  name: 'Login',
  data() {
    return {
      username: '',
      password: '',
      showPassword: false,
      errorMessage: '',
      isSubmitting: false
    }
  },
  methods: {
    async submitLogin() {
      this.errorMessage = ''
      this.isSubmitting = true
      try {
        await useAuth().login()
        this.$router.push('/dashboard')
      } catch (error) {
        this.errorMessage = error.message
      } finally {
        this.isSubmitting = false
      }
    }
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
}

.login-card {
  width: min(420px, 100%);
  padding: 2rem;
  background: var(--white);
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

.login-logo {
  display: block;
  width: 76px;
  height: 76px;
  margin: 0 auto 1.25rem;
  border-radius: 50%;
  object-fit: cover;
}

.login-card h1 {
  text-align: center;
  color: var(--gray-900);
}

.login-subtitle {
  margin: 0.4rem 0 1.5rem;
  color: var(--gray-600);
  text-align: center;
}

.form-input {
  width: 100%;
  margin: 0.35rem 0 1rem;
  padding: 0.75rem;
  border: 1px solid var(--gray-300);
  border-radius: var(--radius-md);
  font: inherit;
}

.password-field {
  position: relative;
}

.password-field .form-input {
  padding-right: 4.5rem;
}

.password-toggle {
  position: absolute;
  top: 50%;
  right: 0.65rem;
  transform: translateY(-50%);
  border: 0;
  background: transparent;
  color: var(--primary-blue);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
}

.login-button {
  width: 100%;
  margin-top: 0.5rem;
  padding: 0.75rem;
  border: 0;
  border-radius: var(--radius-md);
  background: var(--primary-blue);
  color: var(--white);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.login-button:disabled {
  opacity: 0.65;
  cursor: wait;
}

.login-error {
  margin-bottom: 0.75rem;
  color: #b42318;
  font-size: 13px;
}

.back-link {
  display: block;
  margin-top: 1.25rem;
  color: var(--primary-blue);
  text-align: center;
  font-size: 13px;
}
</style>
