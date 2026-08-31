import { memo } from 'react';
import { View } from 'react-native';
import { isHighFee } from '@guide/lib/pool-filters';
import type { Signer } from '@guide/lib/types';
import { poolName } from '../data/signers';
import { useT } from '../i18n';
import { useSettings } from '../settings';
import { shortContract, stxShort } from '../format';
import { space } from '../theme';
import { Pill, Row, Text, TouchCard } from '../ui';
import Identicon from './Identicon';

/**
 * One pool in a list.
 *
 * The name is in italics when the guide made it up out of the contract id, and
 * upright when a person put it in and said where it came from. That is not a
 * decoration: somebody deciding where to put their STX should be able to tell
 * a pool that told us its name from a string we inferred.
 */
function SignerRow({
  signer,
  stakedUstx,
  onPress,
  testID,
  trailing,
}: {
  signer: Signer;
  stakedUstx: bigint | null;
  onPress: () => void;
  testID?: string;
  trailing?: React.ReactNode;
}) {
  const t = useT();
  const { locale } = useSettings();
  const { name, guessed } = poolName(signer, signer.contractId);
  const feePercent =
    signer.feeBips === null || signer.feeBips === undefined
      ? null
      : signer.feeBips / 100;
  /*
   * A fee of 99.99% used to be drawn in the same grey as a fee of 5%: a
   * number, in a row somebody is scrolling past, saying nothing about itself.
   * Four pools charge it and each holds around a million STX, so the pill
   * says which kind of number it is before anybody reads the digits.
   */
  const steep = isHighFee(signer);

  return (
    <TouchCard testID={testID} accessibilityLabel={name} onPress={onPress}>
      <Row gap={space.md}>
        <Identicon hash={signer.identiconHash} size={36} />
        <View style={{ flexShrink: 1, gap: 2 }}>
          <Text
            variant='heading'
            numberOfLines={1}
            style={guessed ? { fontStyle: 'italic' } : undefined}
          >
            {name}
          </Text>
          <Text variant='small' tone='faint' numberOfLines={1}>
            {shortContract(signer.contractId)}
          </Text>
        </View>
        {trailing}
      </Row>
      <Row gap={space.sm} wrap>
        <Pill tone='stx'>
          {t('pools.stakedPill', { amount: stxShort(stakedUstx, locale) })}
        </Pill>
        {feePercent !== null ? (
          <Pill tone={steep ? 'bad' : feePercent === 0 ? 'good' : 'muted'}>
            {t('pools.feePill', { percent: feePercent })}
          </Pill>
        ) : (
          <Pill tone='warn'>{t('pools.feeUnknown')}</Pill>
        )}
        {steep ? <Pill tone='bad'>{t('pools.keepsAlmostAll')}</Pill> : null}
        {signer.registered ? null : (
          <Pill tone='warn'>{t('pools.notRegistered')}</Pill>
        )}
        {signer.openToAnyone ? null : <Pill tone='warn'>{t('pools.notOpen')}</Pill>}
      </Row>
    </TouchCard>
  );
}

/*
 * Memoised: the pool list is forty-five of these, and a row whose signer and
 * amount have not changed has nothing new to draw.
 */
export default memo(SignerRow);
