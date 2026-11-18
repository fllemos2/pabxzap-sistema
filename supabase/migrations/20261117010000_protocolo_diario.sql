-- Protocolo AAAAMMDD-NNNN com sequência diária (decisão de 17/11; ticket wf-pabxzap-22).
-- O núcleo calcula o próximo número a partir do último do dia; a função abaixo reserva esse avanço
-- de forma atômica (compare-and-set). Se outro evento avançou antes, ela devolve false e o webhook refaz o evento.

create table public.protocolo_dia (
  dia     text primary key,   -- 'AAAAMMDD', horário de Brasília
  ultimo  int  not null
);
alter table public.protocolo_dia enable row level security;  -- sem policy: só a service role

create or replace function public.reservar_protocolo(p_dia text, p_de int, p_para int)
returns boolean language plpgsql as $$
begin
  if p_de = 0 then
    insert into public.protocolo_dia (dia, ultimo) values (p_dia, p_para) on conflict (dia) do nothing;
    return found;
  end if;
  update public.protocolo_dia set ultimo = p_para where dia = p_dia and ultimo = p_de;
  return found;
end $$;
revoke execute on function public.reservar_protocolo(text, int, int) from public, anon, authenticated;

-- A sequência antiga (PZ-MMDD-NNNN) não é mais usada.
drop sequence if exists public.seq_protocolo;
