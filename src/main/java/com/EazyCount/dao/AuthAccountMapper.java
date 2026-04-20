package com.EazyCount.dao;

import com.EazyCount.entity.MemberAccountRow;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AuthAccountMapper {

    List<MemberAccountRow> selectMemberAccounts(@Param("accountId") String accountId, @Param("companyId") String companyId);

    void updateAccountLastLogin(@Param("accountId") long accountId);
}
