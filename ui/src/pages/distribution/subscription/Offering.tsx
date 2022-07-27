// Copyright (c) 2022 Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import classnames from "classnames";
import { useLedger, useParty, useStreamQueries } from "@daml/react";
import { Typography, Grid, Table, TableBody, TableCell, TableRow, Button, Paper, TextField } from "@mui/material";
import { useParams } from "react-router-dom";
import useStyles from "../../styles";
import { Service } from "@daml.js/daml-finance-app/lib/Daml/Finance/App/Distribution/Subscription/Service";
import { Spinner } from "../../../components/Spinner/Spinner";
import { BatchFactory } from "@daml.js/daml-finance-settlement/lib/Daml/Finance/Settlement/Batch";
import { Offering as OfferingContract, Subscription } from "@daml.js/daml-finance-app/lib/Daml/Finance/App/Distribution/Subscription/Model";
import { Holding } from "@daml.js/daml-finance-asset/lib/Daml/Finance/Asset/Holding";
import { Reference as AccountReference } from "@daml.js/daml-finance-interface-asset/lib/Daml/Finance/Interface/Asset/Account";
import { fmt, getHolding, getName } from "../../../util";
import { Message } from "../../../components/Message/Message";

export const Offering : React.FC = () => {
  const classes = useStyles();
  const navigate = useNavigate();

  const [ quantity, setQuantity ] = useState(0.0);
  const { contractId } = useParams<any>();
  const cid = contractId?.replace("_", "#");

  const party = useParty();
  const ledger = useLedger();

  const { contracts: services, loading: l1 } = useStreamQueries(Service);
  const { contracts: offerings, loading: l2 } = useStreamQueries(OfferingContract);
  const { contracts: allSubscriptions, loading: l3 } = useStreamQueries(Subscription);
  const { contracts: instructables, loading: l4 } = useStreamQueries(BatchFactory);
  const { contracts: holdings, loading: l5 } = useStreamQueries(Holding);
  const { contracts: accounts, loading: l6 } = useStreamQueries(AccountReference);

  const offering = offerings.find(c => c.contractId === cid);

  if (l1 || l2 || l3 || l4 || l5 || l6) return (<Spinner />);
  if (!contractId) return <Message text="No contract id provided" />
  if (!offering) return <Message text="Subscription not found" />

  const providerServices = services.filter(s => s.payload.provider === party);
  const isProvider = providerServices.length > 0;
  const service = providerServices[0];
  const myHoldings = holdings.filter(c => c.payload.account.owner.map.has(party));
  const subscriptions = allSubscriptions.filter(c => c.payload.offeringId === offering.payload.offeringId);
  const filledPerc = 100.0 * subscriptions.reduce((a, b) => a + parseFloat(b.payload.quantity), 0) / parseFloat(offering.payload.asset.amount);

  const closeSubscription = async () => {
    const subscriptionCids = subscriptions.map(c => c.contractId);
    const arg = { instructableCid: instructables[0].contractId, offeringCid: offering.contractId, subscriptionCids };
    const [result, ] = await ledger.exercise(Service.ProcessOffering, service.contractId, arg);
    navigate("/distribution/subscriptions/" + result)
  };

  const subscribe = async () => {
    const notional = quantity * parseFloat(offering.payload.price.amount);
    const holding = holdings.find(c => c.payload.account.owner.map.has(party) && parseFloat(c.payload.amount) >= notional && c.payload.locker.map.keys.length === 0);
    const investorAccount = accounts.find(c => c.payload.accountView.custodian.map.has(offering.payload.issuer) && c.payload.accountView.owner.map.has(party))?.key;
    if (!holding || !investorAccount) return;
    const investorHoldingCid = await getHolding(ledger, myHoldings, notional, offering.payload.price.unit);
    const arg = { investor: party, quantity: quantity.toString(), investorHoldingCid, investorAccount };
    await ledger.exercise(OfferingContract.Subscribe, offering.contractId, arg);
  };

  return (
    <Grid container direction="column" spacing={2}>
      <Grid item xs={12}>
        <Typography variant="h3" className={classes.heading}>{offering.payload.offeringId}</Typography>
      </Grid>
      <Grid item xs={12}>
        <Grid container spacing={4}>
          <Grid item xs={8}>
            <Grid container direction="column" spacing={2}>
              <Grid item xs={12}>
                <Paper className={classnames(classes.fullWidth, classes.paper)}>
                  <Typography variant="h5" className={classes.heading}>Bids</Typography>
                  <Table size="small">
                    <TableBody>
                      <TableRow key={0} className={classes.tableRow}>
                        <TableCell key={0} className={classes.tableCell}><b>Investor</b></TableCell>
                        <TableCell key={1} className={classes.tableCell}><b>Quantity</b></TableCell>
                        <TableCell key={2} className={classes.tableCell}><b>Percentage</b></TableCell>
                        {/* <TableCell key={3} className={classes.tableCell}><b>Allocation</b></TableCell> */}
                      </TableRow>
                      {subscriptions.map((c, i) => (
                        <TableRow key={i + 1} className={classes.tableRow} hover={true}>
                          <TableCell key={0} className={classes.tableCell}>{getName(c.payload.investor)}</TableCell>
                          <TableCell key={1} className={classes.tableCell}>{fmt(c.payload.quantity)}</TableCell>
                          <TableCell key={2} className={classes.tableCell}>{(100.0 * parseFloat(c.payload.quantity) / parseFloat(offering.payload.asset.amount)).toFixed(2)}%</TableCell>
                          {/* <TableCell key={3} className={classes.tableCell}>{getBidAllocation(instruments, c.payload)}</TableCell> */}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Paper>
              </Grid>
            </Grid>
          </Grid>
          <Grid item xs={4}>
            <Grid container direction="column" spacing={2}>
              <Grid item xs={12}>
                <Paper className={classnames(classes.fullWidth, classes.paper)}>
                  <Typography variant="h5" className={classes.heading}>Details</Typography>
                  <Table size="small">
                    <TableBody>
                      <TableRow key={0} className={classes.tableRow}>
                        <TableCell key={0} className={classes.tableCell}><b>Issuer</b></TableCell>
                        <TableCell key={1} className={classes.tableCell}>{getName(offering.payload.issuer)}</TableCell>
                      </TableRow>
                      <TableRow key={1} className={classes.tableRow}>
                        <TableCell key={0} className={classes.tableCell}><b>Agent</b></TableCell>
                        <TableCell key={1} className={classes.tableCell}>{getName(offering.payload.provider)}</TableCell>
                      </TableRow>
                      <TableRow key={2} className={classes.tableRow}>
                        <TableCell key={0} className={classes.tableCell}><b>Subscription Id</b></TableCell>
                        <TableCell key={1} className={classes.tableCell}>{offering.payload.offeringId}</TableCell>
                      </TableRow>
                      <TableRow key={3} className={classes.tableRow}>
                        <TableCell key={0} className={classes.tableCell}><b>Asset</b></TableCell>
                        <TableCell key={1} className={classes.tableCell}>{fmt(offering.payload.asset.amount)} {offering.payload.asset.unit.id.label}</TableCell>
                      </TableRow>
                      <TableRow key={4} className={classes.tableRow}>
                        <TableCell key={0} className={classes.tableCell}><b>Price</b></TableCell>
                        <TableCell key={1} className={classes.tableCell}>{fmt(offering.payload.price.amount, 4)} {offering.payload.price.unit.id.label}</TableCell>
                      </TableRow>
                      {isProvider && <>
                      <TableRow key={5} className={classes.tableRow}>
                        <TableCell key={0} className={classes.tableCell}><b>Issuer Account</b></TableCell>
                        <TableCell key={1} className={classes.tableCell}>{offering.payload.issuerAccount.id}</TableCell>
                      </TableRow>
                      <TableRow key={6} className={classes.tableRow}>
                        <TableCell key={0} className={classes.tableCell}><b>Subscribed %</b></TableCell>
                        <TableCell key={1} className={classes.tableCell}>{filledPerc.toFixed(2)}%</TableCell>
                      </TableRow></>}
                      <TableRow key={7} className={classes.tableRow}>
                        <TableCell key={0} className={classes.tableCell}><b>Status</b></TableCell>
                        <TableCell key={1} className={classes.tableCell}>{offering.payload.status}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                  {isProvider && <Button className={classnames(classes.fullWidth, classes.buttonMargin)} size="large" variant="contained" color="primary" disabled={offering.payload.status === "Closed" || subscriptions.length === 0} onClick={closeSubscription}>Close Subscription</Button>}
                </Paper>
                <Grid item xs={12}>
                  {!isProvider &&
                  <Paper className={classnames(classes.fullWidth, classes.paper)}>
                    <Typography variant="h5" className={classes.heading}>Subscribe</Typography>
                    <TextField required autoFocus fullWidth type="number" label={"Quantity (" + offering.payload.asset.unit.id.label + ")"} onChange={e => setQuantity(parseFloat(e.target.value))} />
                    <Button color="primary" className={classnames(classes.fullWidth, classes.buttonMargin)} variant="contained" disabled={!quantity} onClick={() => subscribe()}>Subscribe</Button>
                  </Paper>}
                </Grid>
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </Grid>
  );
};