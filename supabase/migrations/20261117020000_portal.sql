-- Portal (ticket wf-pabxzap-23; decisão 2026-11-17-portal-contas-e-hospedagem no wiki).
-- As duas contas (Recepção e administrador) têm as mesmas permissões: ver tudo, resgatar, cadastrar feriados
-- e apagar os dados de um telefone a pedido do titular.

-- Feriados: o portal cadastra e remove.
create policy cadastro_portal on public.feriados for insert to authenticated with check (true);
create policy remocao_portal  on public.feriados for delete to authenticated using (true);

-- Tempo real: o portal acompanha atendimentos e alertas sem recarregar.
alter publication supabase_realtime add table public.atendimentos, public.alertas;

-- Indicadores do período [de, ate) — volume, contatos diretos, encerrados, alertas e não concluídos.
create or replace function public.indicadores(de timestamptz, ate timestamptz)
returns jsonb language sql stable security invoker as $$
  select jsonb_build_object(
    'volume',          (select count(*) from public.atendimentos where criado_em >= de and criado_em < ate),
    'contatos_diretos',(select count(*) from public.atendimentos a join public.numeros n on n.id = a.entrada
                         where a.criado_em >= de and a.criado_em < ate and n.ordem <> 1),
    'encerrados',      (select count(*) from public.atendimentos where estado = 'encerrado' and encerrado_em >= de and encerrado_em < ate),
    'alertas',         (select count(*) from public.alertas where criado_em >= de and criado_em < ate),
    'nao_concluidos',  (select count(*) from public.atendimentos where estado = 'nao_concluido' and encerrado_em >= de and encerrado_em < ate),
    'resgates',        (select count(*) from public.resgates where criado_em >= de and criado_em < ate)
  );
$$;
revoke execute on function public.indicadores(timestamptz, timestamptz) from public, anon;
grant execute on function public.indicadores(timestamptz, timestamptz) to authenticated;

-- Exclusão a pedido do titular (LGPD): apaga mensagens e atendimentos do telefone (alertas e resgates vão junto, em cascata).
-- Fica registrado quem apagou e quando, guardando só os 4 últimos dígitos.
create table public.exclusoes (
  id         bigint generated always as identity primary key,
  final      text not null,                 -- 4 últimos dígitos do telefone
  atendimentos int not null,
  mensagens  int not null,
  por        uuid references auth.users(id) on delete set null,
  criado_em  timestamptz not null default now()
);
alter table public.exclusoes enable row level security;
create policy leitura_portal on public.exclusoes for select to authenticated using (true);

create or replace function public.excluir_dados_cliente(p_cliente text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  tel text := regexp_replace(p_cliente, '\D', '', 'g');
  n_msg int; n_at int;
begin
  if length(tel) < 8 then raise exception 'telefone inválido'; end if;
  -- Aceita o número com ou sem o 9 depois do DDD (o WhatsApp às vezes entrega sem).
  with alvo as (select unnest(array[tel,
                  case when length(tel) = 13 and tel like '55%' then substr(tel, 1, 4) || substr(tel, 6) end,
                  case when length(tel) = 12 and tel like '55%' then substr(tel, 1, 4) || '9' || substr(tel, 5) end]) as c)
  , m as (delete from public.mensagens where cliente in (select c from alvo where c is not null) returning 1)
  select count(*) into n_msg from m;
  with alvo as (select unnest(array[tel,
                  case when length(tel) = 13 and tel like '55%' then substr(tel, 1, 4) || substr(tel, 6) end,
                  case when length(tel) = 12 and tel like '55%' then substr(tel, 1, 4) || '9' || substr(tel, 5) end]) as c)
  , a as (delete from public.atendimentos where cliente in (select c from alvo where c is not null) returning 1)
  select count(*) into n_at from a;
  insert into public.exclusoes (final, atendimentos, mensagens, por) values (right(tel, 4), n_at, n_msg, auth.uid());
  return jsonb_build_object('atendimentos', n_at, 'mensagens', n_msg);
end $$;
revoke execute on function public.excluir_dados_cliente(text) from public, anon;
grant execute on function public.excluir_dados_cliente(text) to authenticated;

-- Relógio: pg_cron chama a Edge Function `relogio` a cada minuto (alerta de 15 min úteis e "não concluído").
-- O endereço e o segredo ficam no Vault; o agendamento é criado por scripts/relogio-agendar.mjs.
create extension if not exists pg_net;
