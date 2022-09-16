// Copyright (c) 2022 Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import React from "react";
import { CreateEvent } from "@daml/ledger";
import { useLedger, useStreamQueries } from "@daml/react";
import { keyEquals } from "../util";
import { Base } from "@daml.js/daml-finance-interface-holding/lib/Daml/Finance/Interface/Holding/Base";
import { Lockable } from "@daml.js/daml-finance-interface-holding/lib/Daml/Finance/Interface/Holding/Lockable";
import { Transferable } from "@daml.js/daml-finance-interface-holding/lib/Daml/Finance/Interface/Holding/Transferable";
import { Fungible } from "@daml.js/daml-finance-interface-holding/lib/Daml/Finance/Interface/Holding/Fungible";
import { InstrumentKey } from "@daml.js/daml-finance-interface-types/lib/Daml/Finance/Interface/Types/Common";
import { ContractId } from "@daml/types";

type HoldingsState = {
  loading : boolean
  holdings : HoldingAggregate[]
  getFungible : (owner : string, amount : number | string, instrument: InstrumentKey) => Promise<ContractId<Fungible>>
};

export type HoldingAggregate = CreateEvent<Base> & {
  lockable : CreateEvent<Lockable> | undefined
  transferable : CreateEvent<Transferable> | undefined
  fungible : CreateEvent<Fungible> | undefined
}

const empty = {
  loading: true,
  holdings: [],
  getFungible: (owner : string, amount : number | string, instrument: InstrumentKey) => { throw new Error("Not implemented"); }
};

const HoldingsContext = React.createContext<HoldingsState>(empty);

export const HoldingsProvider : React.FC = ({ children }) => {

  const ledger = useLedger();
  const { contracts: holdings, loading: l1 } = useStreamQueries(Base);
  const { contracts: lockables, loading: l2 } = useStreamQueries(Lockable);
  const { contracts: transferables, loading: l3 } = useStreamQueries(Transferable);
  const { contracts: fungibles, loading: l4 } = useStreamQueries(Fungible);

  const loading = l1 || l2 || l3 || l4;

  if (loading) {
    return (
      <HoldingsContext.Provider value={empty}>
          {children}
      </HoldingsContext.Provider>
    );
  } else {
    const lockablesByCid : Map<string, CreateEvent<Lockable>> = new Map(lockables.map(c => [c.contractId, c]));
    const transferablesByCid : Map<string, CreateEvent<Transferable>> = new Map(transferables.map(c => [c.contractId, c]));
    const fungiblesByCid : Map<string, CreateEvent<Fungible>> = new Map(fungibles.map(c => [c.contractId, c]));
    const aggregates : HoldingAggregate[] = holdings.map(c => ({ ...c, lockable: lockablesByCid.get(c.contractId), transferable: transferablesByCid.get(c.contractId), fungible: fungiblesByCid.get(c.contractId) }));

    const getFungible = async (owner : string, amount : number | string, instrument: InstrumentKey) : Promise<ContractId<Fungible>> => {
      const qty = typeof amount === "string" ? parseFloat(amount) : amount;
      const filtered = aggregates.filter(c => c.payload.account.owner === owner && keyEquals(c.payload.instrument, instrument) && (!c.lockable || !c.lockable.payload.lock));
      if (!filtered[0].fungible) throw new Error("Holdings are not fungible, cannot right-size to correct amount.");
      const sum = filtered.reduce((a, b) => a + parseFloat(b.payload.amount), 0);
      if (filtered.length === 0 || sum < qty) throw new Error("Insufficient holdings (" + sum.toFixed(4) + ") for " + qty.toFixed(4) + " " + instrument.id.unpack);
      if (filtered.length === 1 && sum === qty) return filtered[0].fungible.contractId;
      if (filtered.length === 1 && sum > qty) {
        const [ { splitCids, }, ] = await ledger.exercise(Fungible.Split, filtered[0].fungible.contractId, { amounts: [ qty.toString() ] });
        return splitCids[0];
      }
      const [h, ...t] = filtered;
      const [fungibleCid, ] = await ledger.exercise(Fungible.Merge, h.fungible!.contractId, { fungibleCids: t.map(c => c.fungible!.contractId) });
      if (sum === qty) return fungibleCid;

      const [ { splitCids, }, ] = await ledger.exercise(Fungible.Split, fungibleCid, { amounts: [ qty.toString() ] });
      return splitCids[0];
    }

    const value = {
      loading,
      holdings: aggregates,
      getFungible
    };

    return (
      <HoldingsContext.Provider value={value}>
          {children}
      </HoldingsContext.Provider>
    );
  }
};

export const useHoldings = () => {
  return React.useContext(HoldingsContext);
}