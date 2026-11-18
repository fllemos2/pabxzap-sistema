-- Expediente, descrição do menu e feriados (ticket wf-pabxzap-21; decisões de 14/11 e 17/11 no wiki).
-- O horário é o de Brasília. O mesmo para todos por enquanto, mas guardado por número.

alter table public.numeros
  add column descricao  text,                                   -- descrição da opção no menu (até 72 caracteres)
  add column expediente jsonb not null
    default '{"dias":[1,2,3,4,5],"inicio":"08:00","fim":"18:00"}'::jsonb;  -- dias: 0 = domingo ... 6 = sábado

-- Feriados cadastrados no portal: fora do expediente o dia inteiro.
create table public.feriados (
  dia        date primary key,
  descricao  text
);
alter table public.feriados enable row level security;
create policy leitura_portal on public.feriados for select to authenticated using (true);

comment on column public.atendimentos.estado is
  'nao_concluido: 2 resgates sem chegada, encerrado 24 h depois do último (decisões de 02/11 e 17/11). O alerta de 15 min úteis fica em alertas e na coluna alertado.';
comment on column public.atendimentos.protocolo is 'Formato AAAAMMDD-NNNN, sequência recomeçando a cada dia (decisão de 17/11).';
