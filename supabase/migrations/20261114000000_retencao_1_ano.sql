-- Retenção de 1 ano (decisão de 14/11/2026), no lugar dos 15 dias.
-- Vale para as mensagens e para os atendimentos encerrados ou não concluídos.
-- O job pg_cron "retencao-diaria" continua chamando esta função às 03:00 de Brasília.
create or replace function public.aplicar_retencao() returns void language sql as $$
  delete from public.mensagens    where criado_em    < now() - interval '1 year';
  delete from public.atendimentos where estado in ('encerrado','nao_concluido') and encerrado_em < now() - interval '1 year';
$$;
