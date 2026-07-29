
CREATE OR REPLACE FUNCTION public.transfer_shares(
  _product_id uuid,
  _to_member_no text,
  _units integer,
  _note text,
  _actor_id uuid
) RETURNS TABLE(out_txn_id uuid, in_txn_id uuid, to_user_id uuid, to_full_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_product public.share_products;
  v_from_holding public.share_holdings;
  v_to_holding public.share_holdings;
  v_to_user uuid;
  v_to_name text;
  v_amount numeric(14,2);
  v_cost_move numeric(14,2);
  v_out_ref text;
  v_in_ref text;
  v_out uuid;
  v_in uuid;
  v_clean_no text;
BEGIN
  IF _actor_id IS NULL OR _actor_id <> auth.uid() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF _units IS NULL OR _units < 1 THEN
    RAISE EXCEPTION 'invalid_units' USING ERRCODE = '22023';
  END IF;
  IF _to_member_no IS NULL OR btrim(_to_member_no) = '' THEN
    RAISE EXCEPTION 'recipient_required' USING ERRCODE = '22023';
  END IF;

  v_clean_no := btrim(_to_member_no);

  SELECT id, full_name INTO v_to_user, v_to_name
    FROM public.profiles
    WHERE member_no = v_clean_no
    LIMIT 1;
  IF v_to_user IS NULL THEN
    RAISE EXCEPTION 'recipient_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_to_user = _actor_id THEN
    RAISE EXCEPTION 'cannot_transfer_to_self' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_product FROM public.share_products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_not_available' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_from_holding FROM public.share_holdings
    WHERE user_id = _actor_id AND product_id = _product_id FOR UPDATE;
  IF NOT FOUND OR v_from_holding.units < _units THEN
    RAISE EXCEPTION 'insufficient_units' USING ERRCODE = '22023';
  END IF;

  v_amount := v_product.unit_price * _units;
  v_cost_move := CASE
    WHEN v_from_holding.units = 0 THEN 0
    ELSE ROUND(v_from_holding.cost_basis * _units::numeric / v_from_holding.units::numeric, 2)
  END;

  UPDATE public.share_holdings
    SET units = units - _units,
        cost_basis = GREATEST(0, cost_basis - v_cost_move)
    WHERE id = v_from_holding.id
    RETURNING * INTO v_from_holding;

  INSERT INTO public.share_holdings (user_id, product_id, units, cost_basis)
  VALUES (v_to_user, _product_id, _units, v_cost_move)
  ON CONFLICT (user_id, product_id) DO UPDATE
    SET units = share_holdings.units + EXCLUDED.units,
        cost_basis = share_holdings.cost_basis + EXCLUDED.cost_basis
  RETURNING * INTO v_to_holding;

  IF v_product.max_units_per_member IS NOT NULL
     AND v_to_holding.units > v_product.max_units_per_member THEN
    RAISE EXCEPTION 'recipient_exceeds_max' USING ERRCODE = '22023';
  END IF;

  v_out_ref := public.gen_txn_ref('SHT');
  v_in_ref  := public.gen_txn_ref('SHT');

  INSERT INTO public.share_transactions
    (ref, holding_id, user_id, product_id, kind, units, unit_price, amount, actor_id, note)
  VALUES
    (v_out_ref, v_from_holding.id, _actor_id, _product_id, 'sale', _units,
     v_product.unit_price, v_amount, _actor_id,
     'Transfer out to member ' || v_clean_no ||
       CASE WHEN _note IS NOT NULL AND btrim(_note) <> '' THEN ' — ' || _note ELSE '' END)
  RETURNING id INTO v_out;

  INSERT INTO public.share_transactions
    (ref, holding_id, user_id, product_id, kind, units, unit_price, amount, actor_id, note)
  VALUES
    (v_in_ref, v_to_holding.id, v_to_user, _product_id, 'purchase', _units,
     v_product.unit_price, v_amount, _actor_id,
     'Transfer in from member ' || COALESCE((SELECT member_no FROM public.profiles WHERE id = _actor_id), _actor_id::text) ||
       CASE WHEN _note IS NOT NULL AND btrim(_note) <> '' THEN ' — ' || _note ELSE '' END)
  RETURNING id INTO v_in;

  INSERT INTO public.audit_log (actor_id, action, target, meta)
  VALUES (_actor_id, 'shares.transfer', v_out::text,
    jsonb_build_object(
      'product_id', _product_id,
      'units', _units,
      'unit_price', v_product.unit_price,
      'amount', v_amount,
      'from_user', _actor_id,
      'to_user', v_to_user,
      'to_member_no', v_clean_no,
      'cost_basis_moved', v_cost_move,
      'out_txn', v_out,
      'in_txn', v_in
    ));

  out_txn_id := v_out;
  in_txn_id := v_in;
  to_user_id := v_to_user;
  to_full_name := v_to_name;
  RETURN NEXT;
END;
$fn$;

REVOKE ALL ON FUNCTION public.transfer_shares(uuid, text, integer, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_shares(uuid, text, integer, text, uuid) TO authenticated;
