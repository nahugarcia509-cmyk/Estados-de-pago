import { useState, type FormEvent } from 'react';
import { db, supabase } from '../lib/client';
export function Login({ onDemo }: { onDemo: () => void }) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      const { error } = await db().auth.signInWithPassword({
        email: String(f.get('email')),
        password: String(f.get('password')),
      });
      if (error) throw error;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login">
      <div className="login-story">
        <span className="brand-mark">V</span>
        <p className="eyebrow">VICUÑA · CONTROL CONTRACTUAL</p>
        <h1>
          La operación de hoy.
          <br />
          La certeza de mañana.
        </h1>
        <p>
          Información operativa y financiera en un solo lugar, con acceso privado para cada empresa.
        </p>
        <small>Estados de Pago | Vicuña</small>
      </div>
      <form onSubmit={submit} className="login-form">
        <h2>Bienvenido</h2>
        <p>Ingresá con tu cuenta autorizada.</p>
        {!supabase && (
          <div className="notice">
            La conexión real está pendiente de configuración. Podés recorrer la demostración sin
            crear una cuenta.
          </div>
        )}
        <label>
          Correo electrónico
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Contraseña
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button disabled={busy || !supabase}>
          {busy ? 'Ingresando…' : 'Ingresar a la plataforma'}
        </button>
        <small>Solicitá el acceso al administrador de tu empresa.</small>
        <button type="button" className="secondary" onClick={onDemo}>
          Ver demostración
        </button>
        <small>Sin usuario ni contraseña · Datos ficticios · Solo lectura</small>
      </form>
    </div>
  );
}
