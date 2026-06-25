/// Configuración de conexión al backend Supabase del GMAO.
/// La anon key es pública por diseño (no es secreta).
class Config {
  static const String supabaseUrl = 'https://xikbhkfeaosasdltartg.supabase.co';
  static const String supabaseAnonKey =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpa2Joa2ZlYW9zYXNkbHRhcnRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MDgzMzAsImV4cCI6MjA5Nzk4NDMzMH0.fY6wbcqXtVOgvY_L0dHTSIUd-8iEjqTqAfNfjImrLbM';

  static const String attachmentsBucket = 'wo-attachments';
}
