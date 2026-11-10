-- PabxZap: esquema inicial (rascunho de 24/10/2026, revisado em 10/11/2026).
-- Espelha os tipos de nucleo/tipos.ts. Decisões refletidas:
--   retenção: 15 dias por enquanto; a intenção é ampliar (decisão de 02/11)
--   pendência e resgate: 2 resgates sem chegada encerram como "não concluído" (decisão de 02/11)
--   alerta de 15 minutos: só no portal, a cargo da Recepção (decisão de 02/11)

-- Os 8 números do laboratório, na ordem do menu. Telefones reais são confidenciais: só aqui, nunca no código.
create table public.numeros (
  id               text primary key,              -- 'rec', 's1'...'s7'
  ordem            int  not null unique,          -- 1..8 (posição no menu)
  nome             text not null,
  telefone         text not null,                 -- formato internacional, só dígitos
  atalho           text not null unique,          -- resposta rápida que encaminha para este número
  phone_number_id  text unique,                   -- ID do número na Cloud API (preenchido na conexão)
  sem_contato_direto    boolean not null default false,   -- RH e Dono
  encerra_ao_responder  boolean not null default false    -- Dono
);

create table public.atendimentos (
  id              bigint generated always as identity primary key,
  protocolo       text unique,
  cliente         text not null,                  -- telefone do cliente
  assunto         text not null,
  entrada         text not null references public.numeros(id),
  -- nao_concluido: 2 resgates sem chegada, encerrado 24 h depois do último (decisão de 02/11)
  estado          text not null check (estado in ('menu','recepcao','encaminhado','em_atendimento','pendente','nao_concluido','encerrado')),
  onde            text not null references public.numeros(id),
  origem          text references public.numeros(id),
  criado_em       timestamptz not null default now(),
  desde           timestamptz not null default now(),
  encaminhado_em  timestamptz,
  alertado        boolean not null default false,  -- alerta de 15 min exibido no portal
  resgates        int  not null default 0 check (resgates between 0 and 2),
  ultimo_resgate_em  timestamptz,
  ultima_msg_cliente_em timestamptz,               -- janela de 24 h: resgate pelo portal grátis ou por template
  respondido_em   timestamptz,
  encerrado_em    timestamptz,
  percurso        jsonb not null default '[]'::jsonb
);
create index atendimentos_cliente_abertos on public.atendimentos (cliente) where estado <> 'encerrado';
create index atendimentos_encaminhados on public.atendimentos (encaminhado_em) where estado = 'encaminhado';

-- Mensagens recebidas (cliente), enviadas pelo sistema e espelhadas do app (smb_message_echoes).
create table public.mensagens (
  id               bigint generated always as identity primary key,
  numero_id        text not null references public.numeros(id),
  cliente          text not null,
  origem           text not null check (origem in ('cliente','sistema','atendente')),
  texto            text,
  wa_message_id    text unique,                   -- evita processar o mesmo webhook duas vezes
  atendimento_id   bigint references public.atendimentos(id) on delete set null,
  criado_em        timestamptz not null default now()
);
create index mensagens_conversa on public.mensagens (numero_id, cliente, criado_em);

-- Alertas aparecem só no portal (a Recepção acompanha todos). "para" guarda quem encaminhou, para o portal mostrar.
create table public.alertas (
  id               bigint generated always as identity primary key,
  atendimento_id   bigint not null references public.atendimentos(id) on delete cascade,
  para             text not null references public.numeros(id),
  destino          text not null references public.numeros(id),
  estado           text not null default 'ativo' check (estado in ('ativo','resgate_enviado','resolvido')),
  criado_em        timestamptz not null default now(),
  resolvido_em     timestamptz
);

create sequence public.seq_protocolo;

-- Acesso: o webhook usa a service role (ignora RLS); o portal só lê, com usuário logado.
alter table public.numeros      enable row level security;
alter table public.atendimentos enable row level security;
alter table public.mensagens    enable row level security;
alter table public.alertas      enable row level security;
create policy leitura_portal on public.numeros      for select to authenticated using (true);
create policy leitura_portal on public.atendimentos for select to authenticated using (true);
create policy leitura_portal on public.mensagens    for select to authenticated using (true);
create policy leitura_portal on public.alertas      for select to authenticated using (true);

-- Resgates feitos (pelo app ou pelo portal), para contar até 2 e para o indicador.
create table public.resgates (
  id               bigint generated always as identity primary key,
  atendimento_id   bigint not null references public.atendimentos(id) on delete cascade,
  canal            text not null check (canal in ('app','portal')),
  por_template     boolean not null default false, -- fora da janela de 24 h: template de utilidade (cobrado)
  criado_em        timestamptz not null default now()
);
alter table public.resgates enable row level security;
create policy leitura_portal on public.resgates for select to authenticated using (true);

-- Retenção de 15 dias, por enquanto (decisão de 02/11). Vale para encerrados e não concluídos.
create or replace function public.aplicar_retencao() returns void language sql as $$
  delete from public.mensagens    where criado_em    < now() - interval '15 days';
  delete from public.atendimentos where estado in ('encerrado','nao_concluido') and encerrado_em < now() - interval '15 days';
$$;

-- Roda todo dia às 03:00 de Brasília (06:00 UTC).
create extension if not exists pg_cron;
select cron.schedule('retencao-diaria', '0 6 * * *', 'select public.aplicar_retencao()');
